import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EnvVarWarning() {
  return (
    <div className="flex items-center gap-4">
      <Badge className="font-normal" variant={"outline"}>
        Supabase environment variables required
      </Badge>
      <div className="flex gap-2">
        <Button disabled size="sm" variant={"outline"}>
          Sign in
        </Button>
        <Button disabled size="sm" variant={"default"}>
          Sign up
        </Button>
      </div>
    </div>
  );
}
