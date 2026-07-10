import type { Editor } from "@tiptap/react"
import { useEffect, useState, type Dispatch, type SetStateAction } from "react"

type Orientation = "horizontal" | "vertical" | "both"

function moveNext<T>(
  items: T[],
  onNavigate: ((item: T, index: number) => void) | undefined,
  setSelectedIndex: Dispatch<SetStateAction<number>>,
): void {
  setSelectedIndex((currentIndex) => {
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % items.length
    onNavigate?.(items[nextIndex], nextIndex)
    return nextIndex
  })
}

function movePrev<T>(
  items: T[],
  onNavigate: ((item: T, index: number) => void) | undefined,
  setSelectedIndex: Dispatch<SetStateAction<number>>,
): void {
  setSelectedIndex((currentIndex) => {
    const nextIndex =
      currentIndex === -1
        ? items.length - 1
        : (currentIndex - 1 + items.length) % items.length
    onNavigate?.(items[nextIndex], nextIndex)
    return nextIndex
  })
}

interface MenuNavigationOptions<T> {
  /**
   * The Tiptap editor instance, if using with a Tiptap editor.
   */
  editor?: Editor | null
  /**
   * Reference to the container element for handling keyboard events.
   */
  containerRef?: React.RefObject<HTMLElement | null>
  /**
   * Search query that affects the selected item.
   */
  query?: string
  /**
   * Array of items to navigate through.
   */
  items: T[]
  /**
   * Callback fired when keyboard navigation changes the selected item.
   */
  onNavigate?: (item: T, index: number) => void
  /**
   * Callback fired when an item is selected.
   */
  onSelect?: (item: T) => void
  /**
   * Callback fired when the menu should close.
   */
  onClose?: () => void
  /**
   * The navigation orientation of the menu.
   * @default "vertical"
   */
  orientation?: Orientation
  /**
   * Whether to automatically select the first item when the menu opens.
   * @default true
   */
  autoSelectFirstItem?: boolean
}

/**
 * Hook that implements keyboard navigation for dropdown menus and command palettes.
 *
 * Handles arrow keys, tab, home/end, enter for selection, and escape to close.
 * Works with both Tiptap editors and regular DOM elements.
 *
 * @param options - Configuration options for the menu navigation
 * @returns Object containing the selected index and a setter function
 */
export function useMenuNavigation<T>({
  editor,
  containerRef,
  query,
  items,
  onSelect,
  onNavigate,
  onClose,
  orientation = "vertical",
  autoSelectFirstItem = true,
}: MenuNavigationOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState<number>(
    autoSelectFirstItem ? 0 : -1
  )

  useEffect(() => {
    const handleKeyboardNavigation = (event: KeyboardEvent) => {
      if (!items.length) return false

      switch (event.key) {
        case "ArrowUp": {
          if (orientation === "horizontal") return false
          event.preventDefault()
          movePrev(items, onNavigate, setSelectedIndex)
          return true
        }

        case "ArrowDown": {
          if (orientation === "horizontal") return false
          event.preventDefault()
          moveNext(items, onNavigate, setSelectedIndex)
          return true
        }

        case "ArrowLeft": {
          if (orientation === "vertical") return false
          event.preventDefault()
          movePrev(items, onNavigate, setSelectedIndex)
          return true
        }

        case "ArrowRight": {
          if (orientation === "vertical") return false
          event.preventDefault()
          moveNext(items, onNavigate, setSelectedIndex)
          return true
        }

        case "Tab": {
          event.preventDefault()
          if (event.shiftKey) {
            movePrev(items, onNavigate, setSelectedIndex)
          } else {
            moveNext(items, onNavigate, setSelectedIndex)
          }
          return true
        }

        case "Home": {
          event.preventDefault()
          onNavigate?.(items[0], 0)
          setSelectedIndex(0)
          return true
        }

        case "End": {
          event.preventDefault()
          const lastIndex = items.length - 1
          onNavigate?.(items[lastIndex], lastIndex)
          setSelectedIndex(lastIndex)
          return true
        }

        case "Enter": {
          if (event.isComposing) return false
          event.preventDefault()
          if (selectedIndex !== -1 && items[selectedIndex]) {
            onSelect?.(items[selectedIndex])
          }
          return true
        }

        case "Escape": {
          event.preventDefault()
          onClose?.()
          return true
        }

        default:
          return false
      }
    }

    let targetElement: HTMLElement | null = null

    if (editor) {
      targetElement = editor.view.dom
    } else if (containerRef?.current) {
      targetElement = containerRef.current
    }

    if (targetElement) {
      targetElement.addEventListener("keydown", handleKeyboardNavigation, true)

      return () => {
        targetElement?.removeEventListener(
          "keydown",
          handleKeyboardNavigation,
          true
        )
      }
    }

    return undefined
  }, [
    editor,
    containerRef,
    items,
    selectedIndex,
    onSelect,
    onNavigate,
    onClose,
    orientation,
  ])

  useEffect(() => {
    if (query) {
      setSelectedIndex(autoSelectFirstItem ? 0 : -1)
    }
  }, [query, autoSelectFirstItem])

  return {
    selectedIndex: items.length ? selectedIndex : undefined,
    setSelectedIndex,
  }
}
