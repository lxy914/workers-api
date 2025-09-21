import { Hono } from "hono";
import { cors } from 'hono/cors'
import { user, jwt_verify } from "./user";
import { post } from "./post"


type Variables = {
  role: string
}

const app = new Hono<{ Bindings: CloudflareBindings, Variables: Variables }>();


app.use('/api/*', cors())
app.use("/api/post/*", jwt_verify)
app.get("/", (c) => {
  return c.text("Hello!");
});
app.route("/api/user", user);
app.route("/api/post", post);

export default app;
