import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import path from "node:path"

// ── State helpers (mirrors state.ts but sync) ──

interface StateFile {
  enabled?: boolean
  aggressive?: boolean
}

type YoloMode = "off" | "on" | "aggressive"

function modeToState(mode: YoloMode): Required<StateFile> {
  return {
    enabled: mode !== "off",
    aggressive: mode === "aggressive",
  }
}

function stateToMode(state: StateFile, defaultValue: YoloMode): YoloMode {
  if (typeof state.aggressive === "boolean") {
    return state.aggressive ? "aggressive" : state.enabled ? "on" : "off"
  }
  if (typeof state.enabled === "boolean") {
    return state.enabled ? "on" : "off"
  }
  return defaultValue
}

function defaultStatePath(): string {
  return path.join(process.cwd(), ".yolo.json")
}

function readModeSync(defaultValue: YoloMode = "off", filePath = defaultStatePath()): YoloMode {
  try {
    const data = readFileSync(filePath, "utf8")
    const parsed = JSON.parse(data) as StateFile
    return stateToMode(parsed, defaultValue)
  } catch {
    return defaultValue
  }
}

function writeModeSync(mode: YoloMode, filePath = defaultStatePath()): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(modeToState(mode), null, 2), "utf8")
}

// ── TUI Plugin ──

const MODE_LABELS: Record<YoloMode, string> = {
  off: "Off",
  on: "On",
  aggressive: "Aggressive",
}

const MODE_DESCRIPTIONS: Record<YoloMode, string> = {
  off: "Require manual approval for every tool call",
  on: "Auto-approve all tool calls",
  aggressive: "Auto-approve + auto-continue in background",
}

function makeOptions(api: any, current: YoloMode) {
  const modes: YoloMode[] = ["off", "on", "aggressive"]
  return modes.map((mode) => ({
    title: `${mode === current ? "●" : "○"} ${MODE_LABELS[mode]}`,
    value: mode,
    description:
      mode === current
        ? `Currently active — ${MODE_DESCRIPTIONS[mode]}`
        : MODE_DESCRIPTIONS[mode],
    onSelect() {
      writeModeSync(mode)
      api.ui.dialog.clear()
    },
  }))
}

interface TuiPluginApi {
  command?: {
    register: (fn: () => Array<{
      value: string
      title: string
      description?: string
      slash?: { name: string }
      onSelect?: () => void
    }>) => void
  }
  ui: {
    dialog: {
      replace: (render: () => any, onClose?: () => void) => void
      clear: () => void
    }
    DialogSelect: (props: {
      title: string
      options: Array<{
        title: string
        value: string
        description?: string
        onSelect?: () => void
      }>
      onSelect?: (option: any) => void
    }) => any
  }
}

export default {
  id: "yolo:tui",
  tui: (api: TuiPluginApi) => {
    if (api.command?.register) {
      api.command.register(() => [
        {
          value: "yolo",
          title: "Set YOLO mode",
          description: "Choose auto-approval mode for tool calls",
          slash: { name: "yolo" },
          onSelect() {
            const current = readModeSync()
            api.ui.dialog.replace(() =>
              api.ui.DialogSelect({
                title: `YOLO Mode — ${MODE_LABELS[current]}`,
                options: makeOptions(api, current),
              })
            )
          },
        },
      ])
    }
  },
}
