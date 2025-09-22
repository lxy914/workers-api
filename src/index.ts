import { Hono } from "hono";
import { cors } from 'hono/cors'
import { user, jwt_verify } from "./user";
import { post } from "./post"
import { obj } from "./durable-object"
export { Counter } from "./durable-object"



const app = new Hono();


app.use('/api/*', cors())
app.use("/api/post/*", jwt_verify)

app.route("/api/user", user);
app.route("/api/post", post);
app.route("/",obj)

export default app;
