import { Hono } from "hono";
import {user,jwt_verify} from "./user";
const app = new Hono<{ Bindings: CloudflareBindings }>();


app.use("/message/*",jwt_verify)
app.get("/message", (c) => {
  return c.text("Hello Hono!");
});
app.route("/user",user);

export default app;
