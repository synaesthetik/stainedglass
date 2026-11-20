export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Task = { id: string; subject: string; activeForm?: string; status: TaskStatus; blockedBy: string[] }
export type Choice = { key: string; label: string; detail?: string; recommended?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'stainedglass': {
      tasks: Shaped<Task[]>
    }
  }
}
