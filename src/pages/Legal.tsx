import { Link, useParams } from "react-router-dom";
import { Ticket, ArrowLeft } from "lucide-react";

const content: Record<string, { title: string; body: string }> = {
  terms: {
    title: "Terms of Service",
    body: `Welcome to EnventSuite. By using the platform you agree to these terms.

1. Accounts. You are responsible for the activity that occurs under your account and for safeguarding your password.

2. Organizer responsibilities. As an organizer, you are solely responsible for the events you create, the accuracy of the information you provide, and any communications with attendees.

3. Tickets and refunds. EnventSuite facilitates ticket sales between organizers and attendees. Refund decisions are made by the organizer unless required otherwise by law.

4. Acceptable use. You will not use the platform to host illegal events, infringe intellectual property, or distribute harmful content.

5. Service availability. We strive to keep the service available but do not guarantee uninterrupted access.

6. Liability. To the maximum extent permitted by law, EnventSuite is not liable for indirect or consequential damages.

These terms are a placeholder template. Replace with your final legal copy before going to production.`,
  },
  privacy: {
    title: "Privacy Policy",
    body: `EnventSuite collects only the data needed to operate the service.

Information we collect: account details (name, email), event content you create, ticket purchases, and analytics data needed for fraud prevention and service quality.

How we use it: to operate the platform, fulfil ticket orders, contact you about your account, and improve our product.

Sharing: we share necessary order details with the event organizer when you buy a ticket. We do not sell personal data.

Storage and security: data is encrypted in transit and at rest. Access is restricted via role‑based permissions.

Your rights: you can request access, correction or deletion of your data at any time.

This policy is a placeholder template. Replace with your final legal copy before going to production.`,
  },
};

const Legal = () => {
  const { doc } = useParams();
  const c = content[doc || "terms"] || content.terms;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center"><Ticket className="h-4 w-4 text-primary-foreground" /></div>
            <span className="font-bold">EnventSuite</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Home</Link>
        </div>
      </header>
      <article className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">{c.title}</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated {new Date().toLocaleDateString()}</p>
        <div className="prose prose-sm max-w-none whitespace-pre-line text-foreground/85 leading-relaxed">{c.body}</div>
      </article>
    </div>
  );
};

export default Legal;
