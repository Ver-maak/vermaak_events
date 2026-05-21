import logo from "@/assets/vermaak-logo.png";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export const BrandLogo = ({ className, alt = "Vermaak" }: BrandLogoProps) => (
  <img src={logo} alt={alt} className={cn("object-contain", className)} />
);

export default BrandLogo;
