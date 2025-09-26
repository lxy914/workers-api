import { Hono } from 'hono'
import { DurableObject } from 'cloudflare:workers'
export class Counter extends DurableObject {
  // In-memory state
  value = 0

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    // `blockConcurrencyWhile()` ensures no requests are delivered until initialization completes.
    ctx.blockConcurrencyWhile(async () => {
      // After initialization, future reads do not need to access storage.
      this.value = (await ctx.storage.get('value')) || 0
    })
  }

  async fetch(request: Request) {
      return new Response("")
  }
  async getCounterValue() {
    return this.value
  }

  async increment(amount = 1): Promise<number> {
    this.value += amount
    await this.ctx.storage.put('value', this.value)
    return this.value
  }

  async decrement(amount = 1): Promise<number> {
    this.value -= amount
    await this.ctx.storage.put('value', this.value)
    return this.value
  }
}

export class ChatRoom extends DurableObject {
  // 存储当前连接的 WebSocket 客户端
  clients: WebSocket[];

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.clients = [];
    this.ctx.getWebSockets().forEach((ws) => {
      this.clients.push(ws);
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // 处理 HTTP 请求，升级到 WebSocket 连接
  async fetch(request: Request): Promise<Response> {
    // 检查是否是 WebSocket 升级请求
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('请使用 WebSocket 连接', { status: 426 });
    }
    // 创建 WebSocket 对
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.clients.push(server);
    // 发送欢迎消息
    server.send(JSON.stringify({
      type: 'system',
      message: '欢迎加入聊天房间！当前在线人数: ' + this.clients.length
    }));

    // 返回客户端 WebSocket
    return new Response(null, {
      status: 101,
      webSocket: client,
    });

  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    console.log('Received message:', message)
    const parsed = JSON.parse(message as string);
    // 广播消息给所有连接的客户端（除了发送者）
    for (const client of this.clients) {
      if (client==ws) continue;
      client.send(JSON.stringify({
        type: 'message',
        user: parsed.user,
        content: parsed.content,
        timestamp: new Date().toISOString()
      }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.clients = this.clients.filter(client => client !== ws);

    // 广播用户离开的消息
    const leaveMessage = {
      type: 'system',
      message: `有用户离开房间。当前在线人数: ${this.clients.length}`,
    };
    console.log('Broadcasting user leave message:', leaveMessage)
    for (const client of this.clients) {
      client.send(JSON.stringify(leaveMessage));
    }
  }
}
export const obj = new Hono<{ Bindings: CloudflareBindings }>()

// Add routes to interact with the Durable Object
obj.get('/counter', async (c) => {
  const env = c.env
  const stub = env.COUNTER.getByName('counter')
  const counterValue = await stub.getCounterValue()
  return c.text(counterValue.toString())
})

obj.get('/counter/increment', async (c) => {
  const env = c.env
  const stub = env.COUNTER.getByName('counter')
  const value = await stub.increment()
  return c.text(value.toString())
})

obj.get('/counter/decrement', async (c) => {
  const env = c.env
  const stub = env.COUNTER.getByName('counter')
  const value = await stub.decrement()
  return c.text(value.toString())
})
obj.get('/chat', async (c) => {
  const stub = c.env.CHAT.getByName('chat')
  return stub.fetch(c.req.raw);
})
