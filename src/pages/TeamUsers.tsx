import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

const TeamUsers = () => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");

  const { data: users, isLoading } = useQuery({
    queryKey: ["team-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      const userIds = profiles?.map(p => p.id) || [];
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      
      return profiles?.map(p => ({
        ...p,
        user_roles: rolesData?.filter(r => r.user_id === p.id) || [],
      })) || [];
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{isSuperAdmin ? "All Users" : "Team Members"}</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin ? "Manage all platform users" : "View your organization's team"}
          </p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Users</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : users && users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Name</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Email</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Role</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">KYC</th>
                      <th className="text-left text-xs font-medium text-muted-foreground pb-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-border last:border-0">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                              {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <span className="text-sm font-medium">{user.full_name || "Unknown"}</span>
                          </div>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">{user.email}</td>
                        <td className="py-3">
                          {(user.user_roles as any[])?.map((r: any) => (
                            <Badge key={r.role} variant="outline" className="text-xs capitalize mr-1">
                              {r.role.replace("_", " ")}
                            </Badge>
                          ))}
                        </td>
                        <td className="py-3">
                          <Badge variant="outline" className={
                            user.kyc_status === "verified" ? "bg-success/10 text-success border-success/20" :
                            user.kyc_status === "pending" ? "bg-warning/10 text-warning border-warning/20" :
                            "bg-muted text-muted-foreground"
                          }>
                            {user.kyc_status || "pending"}
                          </Badge>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium">No users found</h3>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeamUsers;
