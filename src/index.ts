import { Hono } from "hono";
import {user,jwt_verify} from "./user";

type Variables = {
  role: string
}

const app = new Hono<{ Bindings: CloudflareBindings,Variables:Variables }>();



app.use("/message/*",jwt_verify)
app.get("/message", (c) => {
  const role = c.get("role")
  return c.text("Hello Hono! "+role);
});
app.route("/user",user);

export default app;
