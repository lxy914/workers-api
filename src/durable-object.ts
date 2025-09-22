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
