import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

const EmptyState = ({ icon, title, description, action }: Props) => (
  <Card className="p-10 flex flex-col items-center justify-center text-center border-dashed">
    {icon && <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">{icon}</div>}
    <h3 className="font-semibold text-lg mb-1">{title}</h3>
    {description && <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>}
    {action}
  </Card>
);

export default EmptyState;
