
-- Create enums
CREATE TYPE public.app_role AS ENUM ('super_admin', 'tenant_admin', 'staff', 'end_user');
CREATE TYPE public.transaction_type AS ENUM ('deposit', 'withdrawal', 'transfer', 'payment', 'refund', 'fee');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE public.currency_code AS ENUM ('UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF');

-- Organizations (tenants)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status public.tenant_status NOT NULL DEFAULT 'active',
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  feature_flags JSONB DEFAULT '{"wallets": true, "payments": false, "bulk_payments": false, "subscriptions": false, "mobile_money": false, "cards": false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  kyc_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, organization_id)
);

-- Wallets
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL DEFAULT 'UGX',
  balance DECIMAL(20, 4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id, currency)
);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_wallet_id UUID REFERENCES public.wallets(id),
  to_wallet_id UUID REFERENCES public.wallets(id),
  type public.transaction_type NOT NULL,
  amount DECIMAL(20, 4) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'UGX',
  status public.transaction_status NOT NULL DEFAULT 'pending',
  description TEXT,
  reference TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- RLS Policies: Organizations
CREATE POLICY "Super admins see all orgs" ON public.organizations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Members see own org" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_org(auth.uid()));
CREATE POLICY "Super admins insert orgs" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins update orgs" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies: Profiles
CREATE POLICY "Users see own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Tenant admins see org profiles" ON public.profiles FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Super admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins see all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies: User roles
CREATE POLICY "Super admins manage all roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Tenant admins manage org roles" ON public.user_roles FOR ALL TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()) AND public.has_role(auth.uid(), 'tenant_admin'));

-- RLS Policies: Wallets
CREATE POLICY "Users see own wallets" ON public.wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Org admins see org wallets" ON public.wallets FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()) AND (
    public.has_role(auth.uid(), 'tenant_admin') OR public.has_role(auth.uid(), 'super_admin')
  ));
CREATE POLICY "Super admins manage wallets" ON public.wallets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Tenant admins insert wallets" ON public.wallets FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org(auth.uid()) AND public.has_role(auth.uid(), 'tenant_admin'));

-- RLS Policies: Transactions
CREATE POLICY "Users see own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (
    from_wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()) OR
    to_wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
  );
CREATE POLICY "Org admins see org transactions" ON public.transactions FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()) AND (
    public.has_role(auth.uid(), 'tenant_admin') OR public.has_role(auth.uid(), 'super_admin')
  ));

-- RLS Policies: Audit logs
CREATE POLICY "Admins see audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    (organization_id = public.get_user_org(auth.uid()) AND public.has_role(auth.uid(), 'tenant_admin'))
  );
CREATE POLICY "System inserts audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Transfer function
CREATE OR REPLACE FUNCTION public.transfer_funds(
  _from_wallet_id UUID,
  _to_wallet_id UUID,
  _amount DECIMAL,
  _description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _from_wallet wallets%ROWTYPE;
  _to_wallet wallets%ROWTYPE;
  _tx_id UUID;
BEGIN
  SELECT * INTO _from_wallet FROM wallets WHERE id = _from_wallet_id FOR UPDATE;
  SELECT * INTO _to_wallet FROM wallets WHERE id = _to_wallet_id FOR UPDATE;

  IF _from_wallet IS NULL OR _to_wallet IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF _from_wallet.currency != _to_wallet.currency THEN
    RAISE EXCEPTION 'Currency mismatch';
  END IF;
  IF _from_wallet.balance < _amount THEN
    RAISE EXCEPTION 'Insufficient funds';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE wallets SET balance = balance - _amount, updated_at = now() WHERE id = _from_wallet_id;
  UPDATE wallets SET balance = balance + _amount, updated_at = now() WHERE id = _to_wallet_id;

  INSERT INTO transactions (organization_id, from_wallet_id, to_wallet_id, type, amount, currency, status, description, reference)
  VALUES (_from_wallet.organization_id, _from_wallet_id, _to_wallet_id, 'transfer', _amount, _from_wallet.currency, 'completed', _description, 'TXN-' || substr(gen_random_uuid()::text, 1, 8))
  RETURNING id INTO _tx_id;

  RETURN _tx_id;
END;
$$;
