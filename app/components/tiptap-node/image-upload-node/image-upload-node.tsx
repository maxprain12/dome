import { useRef, useState } from "react"
import type { NodeViewProps } from "@tiptap/react"
import { NodeViewWrapper } from "@tiptap/react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { CloseIcon } from "@/components/tiptap-icons/close-icon"
import "@/components/tiptap-node/image-upload-node/image-upload-node.scss"
import { focusNextNode, isValidPosition } from "@/lib/tiptap-utils"

export interface FileItem {
  /**
   * Unique identifier for the file item
   */
  id: string
  /**
   * The actual File object being uploaded
   */
  file: File
  /**
   * Current upload progress as a percentage (0-100)
   */
  progress: number
  /**
   * Current status of the file upload process
   * @default "uploading"
   */
  status: "uploading" | "success" | "error"

  /**
   * URL to the uploaded file, available after successful upload
   * @optional
   */
  url?: string
  /**
   * Controller that can be used to abort the upload process
   * @optional
   */
  abortController?: AbortController
}

export interface UploadOptions {
  /**
   * Maximum allowed file size in bytes
   */
  maxSize: number
  /**
   * Maximum number of files that can be uploaded
   */
  limit: number
  /**
   * String specifying acceptable file types (MIME types or extensions)
   * @example ".jpg,.png,image/jpeg" or "image/*"
   */
  accept: string
  /**
   * Function that handles the actual file upload process
   * @param {File} file - The file to be uploaded
   * @param {Function} onProgress - Callback function to report upload progress
   * @param {AbortSignal} signal - Signal that can be used to abort the upload
   * @returns {Promise<string>} Promise resolving to the URL of the uploaded file
   */
  upload: (
    file: File,
    onProgress: (event: { progress: number }) => void,
    signal: AbortSignal
  ) => Promise<string>
  /**
   * Callback triggered when a file is uploaded successfully
   * @param {string} url - URL of the successfully uploaded file
   * @optional
   */
  onSuccess?: (url: string) => void
  /**
   * Callback triggered when an error occurs during upload
   * @param {Error} error - The error that occurred
   * @optional
   */
  onError?: (error: Error) => void
}

/**
 * Custom hook for managing multiple file uploads with progress tracking and cancellation
 */
function useFileUpload(options: UploadOptions) {
  const [fileItems, setFileItems] = useState<FileItem[]>([])

  const uploadFile = async (file: File): Promise<string | null> => {
    if (file.size > options.maxSize) {
      const error = new Error(
        `File size exceeds maximum allowed (${options.maxSize / 1024 / 1024}MB)`
      )
      options.onError?.(error)
      return null
    }

    const abortController = new AbortController()
    const fileId = crypto.randomUUID()

    const newFileItem: FileItem = {
      id: fileId,
      file,
      progress: 0,
      status: "uploading",
      abortController,
    }

    setFileItems((prev) => [...prev, newFileItem])

    try {
      if (!options.upload) {
        throw new Error("Upload function is not defined")
      }

      const url = await options.upload(
        file,
        (event: { progress: number }) => {
          setFileItems((prev) =>
            prev.map((item) =>
              item.id === fileId ? { ...item, progress: event.progress } : item
            )
          )
        },
        abortController.signal
      )

      if (!url) throw new Error("Upload failed: No URL returned")

      if (!abortController.signal.aborted) {
        setFileItems((prev) =>
          prev.map((item) =>
            item.id === fileId
              ? { ...item, status: "success", url, progress: 100 }
              : item
          )
        )
        options.onSuccess?.(url)
        return url
      }

      return null
    } catch (error) {
      if (!abortController.signal.aborted) {
        setFileItems((prev) =>
          prev.map((item) =>
            item.id === fileId
              ? { ...item, status: "error", progress: 0 }
              : item
          )
        )
        options.onError?.(
          error instanceof Error ? error : new Error("Upload failed")
        )
      }
      return null
    }
  }

  const uploadFiles = async (files: File[]): Promise<string[]> => {
    if (!files || files.length === 0) {
      options.onError?.(new Error("No files to upload"))
      return []
    }

    if (options.limit && files.length > options.limit) {
      options.onError?.(
        new Error(
          `Maximum ${options.limit} file${options.limit === 1 ? "" : "s"} allowed`
        )
      )
      return []
    }

    // Upload all files concurrently
    const uploadPromises = files.map((file) => uploadFile(file))
    const results = await Promise.all(uploadPromises)

    // Filter out null results (failed uploads)
    return results.filter((url): url is string => url !== null)
  }

  const removeFileItem = (fileId: string) => {
    setFileItems((prev) => {
      const fileToRemove = prev.find((item) => item.id === fileId)
      if (fileToRemove?.abortController) {
        fileToRemove.abortController.abort()
      }
      if (fileToRemove?.url) {
        URL.revokeObjectURL(fileToRemove.url)
      }
      return prev.filter((item) => item.id !== fileId)
    })
  }

  const clearAllFiles = () => {
    fileItems.forEach((item) => {
      if (item.abortController) {
        item.abortController.abort()
      }
      if (item.url) {
        URL.revokeObjectURL(item.url)
      }
    })
    setFileItems([])
  }

  return {
    fileItems,
    uploadFiles,
    removeFileItem,
    clearAllFiles,
  }
}

const CloudUploadIcon: React.FC = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    className="tiptap-image-upload-icon"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.2 4.42C10.35 4.08 9.44 3.95 8.53 4.02C7.62 4.09 6.74 4.37 5.96 4.83C5.17 5.3 4.5 5.93 4 6.69C3.5 7.45 3.17 8.31 3.05 9.21C2.93 10.12 3.02 11.03 3.31 11.9C3.6 12.76 4.08 13.55 4.71 14.2C5.1 14.59 5.09 15.23 4.7 15.61C4.3 16 3.67 15.99 3.29 15.6C2.44 14.73 1.8 13.68 1.41 12.53C1.03 11.38 0.91 10.15 1.07 8.95C1.23 7.75 1.66 6.6 2.33 5.58C3 4.57 3.9 3.73 4.94 3.11C5.99 2.49 7.16 2.12 8.37 2.03C9.58 1.93 10.8 2.11 11.93 2.56C13.06 3 14.07 3.69 14.89 4.59C15.54 5.3 16.06 6.11 16.42 7H17.5C18.68 7 19.83 7.38 20.78 8.08C21.72 8.79 22.42 9.77 22.76 10.9C23.11 12.03 23.08 13.24 22.68 14.35C22.28 15.46 21.54 16.42 20.56 17.07C20.1 17.38 19.48 17.26 19.17 16.8C18.86 16.34 18.99 15.72 19.44 15.41C20.07 14.99 20.54 14.39 20.8 13.68C21.05 12.97 21.07 12.2 20.85 11.48C20.63 10.77 20.19 10.14 19.59 9.69C18.98 9.24 18.25 9 17.5 9H15.71C15.27 9 14.88 8.71 14.75 8.29C14.49 7.41 14.04 6.61 13.42 5.94C12.8 5.27 12.04 4.75 11.2 4.42Z"
      fill="currentColor"
    />
    <path
      d="M11 14.41V21C11 21.55 11.45 22 12 22C12.55 22 13 21.55 13 21V14.41L15.29 16.71C15.68 17.1 16.32 17.1 16.71 16.71C17.1 16.32 17.1 15.68 16.71 15.29L12.71 11.29C12.71 11.29 12.7 11.29 12.7 11.29C12.52 11.11 12.27 11 12 11L12 11L12 11C11.86 11 11.73 11.03 11.62 11.08C11.5 11.12 11.39 11.19 11.3 11.29C11.3 11.29 11.29 11.29 11.29 11.29L7.29 15.29C6.9 15.68 6.9 16.32 7.29 16.71C7.68 17.1 8.32 17.1 8.71 16.71L11 14.41Z"
      fill="currentColor"
    />
  </svg>
)

const FileIcon: React.FC = () => (
  <svg
    width="43"
    height="57"
    viewBox="0 0 43 57"
    fill="currentColor"
    className="tiptap-image-upload-dropzone-rect-primary"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M0.75 10.75C0.75 5.64 4.89 1.5 10 1.5H32.34C33.21 1.5 34.03 1.84 34.64 2.45L40.3 8.11C40.91 8.72 41.25 9.54 41.25 10.41V46.75C41.25 51.86 37.11 56 32 56H10C4.89 56 0.75 51.86 0.75 46.75V10.75Z"
      fill="currentColor"
      fillOpacity="0.11"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
)

const FileCornerIcon: React.FC = () => (
  <svg
    width="10"
    height="10"
    className="tiptap-image-upload-dropzone-rect-secondary"
    viewBox="0 0 10 10"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M0 0.75H0.34C1.4 0.75 2.42 1.17 3.17 1.92L8.83 7.58C9.58 8.33 10 9.35 10 10.41V10.75H4C1.79 10.75 0 8.96 0 6.75V0.75Z"
      fill="currentColor"
    />
  </svg>
)

interface ImageUploadDragAreaProps {
  /**
   * Callback function triggered when files are dropped or selected
   * @param {File[]} files - Array of File objects that were dropped or selected
   */
  onFile: (files: File[]) => void
  /**
   * Optional child elements to render inside the drag area
   * @optional
   * @default undefined
   */
  children?: React.ReactNode
}

/**
 * A component that creates a drag-and-drop area for image uploads
 */
const ImageUploadDragArea: React.FC<ImageUploadDragAreaProps> = ({
  onFile,
  children,
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragActive(false)
      setIsDragOver(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFile(files)
    }
  }

  return (
    <div
      className={`tiptap-image-upload-drag-area ${isDragActive ? "drag-active" : ""} ${isDragOver ? "drag-over" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
    </div>
  )
}

interface ImageUploadPreviewProps {
  /**
   * The file item to preview
   */
  fileItem: FileItem
  /**
   * Callback to remove this file from upload queue
   */
  onRemove: () => void
}

/**
 * Component that displays a preview of an uploading file with progress
 */
const ImageUploadPreview: React.FC<ImageUploadPreviewProps> = ({
  fileItem,
  onRemove,
}) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  return (
    <div className="tiptap-image-upload-preview">
      {fileItem.status === "uploading" && (
        <div
          className="tiptap-image-upload-progress"
          style={{ width: `${fileItem.progress}%` }}
        />
      )}

      <div className="tiptap-image-upload-preview-content">
        <div className="tiptap-image-upload-file-info">
          <div className="tiptap-image-upload-file-icon">
            <CloudUploadIcon />
          </div>
          <div className="tiptap-image-upload-details">
            <span className="tiptap-image-upload-text">
              {fileItem.file.name}
            </span>
            <span className="tiptap-image-upload-subtext">
              {formatFileSize(fileItem.file.size)}
            </span>
          </div>
        </div>
        <div className="tiptap-image-upload-actions">
          {fileItem.status === "uploading" && (
            <span className="tiptap-image-upload-progress-text">
              {fileItem.progress}%
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <CloseIcon className="tiptap-button-icon" />
          </Button>
        </div>
      </div>
    </div>
  )
}

const DropZoneContent: React.FC<{ maxSize: number; limit: number }> = ({
  maxSize,
  limit,
}) => (
  <>
    <div className="tiptap-image-upload-dropzone">
      <FileIcon />
      <FileCornerIcon />
      <div className="tiptap-image-upload-icon-container">
        <CloudUploadIcon />
      </div>
    </div>

    <div className="tiptap-image-upload-content">
      <span className="tiptap-image-upload-text">
        <em>Click to upload</em> or drag and drop
      </span>
      <span className="tiptap-image-upload-subtext">
        Maximum {limit} file{limit === 1 ? "" : "s"}, {maxSize / 1024 / 1024}MB
        each.
      </span>
    </div>
  </>
)

export const ImageUploadNode: React.FC<NodeViewProps> = (props) => {
  const { t } = useTranslation()
  const { accept, limit, maxSize } = props.node.attrs
  const inputRef = useRef<HTMLInputElement>(null)
  const extension = props.extension

  const uploadOptions: UploadOptions = {
    maxSize,
    limit,
    accept,
    upload: extension.options.upload,
    onSuccess: extension.options.onSuccess,
    onError: extension.options.onError,
  }

  const { fileItems, uploadFiles, removeFileItem, clearAllFiles } =
    useFileUpload(uploadOptions)

  const handleUpload = async (files: File[]) => {
    const urls = await uploadFiles(files)

    if (urls.length > 0) {
      const pos = props.getPos()

      if (isValidPosition(pos)) {
        const imageNodes = urls.map((url, index) => {
          const filename =
            files[index]?.name.replace(/\.[^/.]+$/, "") || "unknown"
          return {
            type: extension.options.type,
            attrs: {
              ...extension.options,
              src: url,
              alt: filename,
              title: filename,
            },
          }
        })

        props.editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + props.node.nodeSize })
          .insertContentAt(pos, imageNodes)
          .run()

        focusNextNode(props.editor)
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      extension.options.onError?.(new Error("No file selected"))
      return
    }
    handleUpload(Array.from(files))
  }

  const handleClick = () => {
    if (inputRef.current && fileItems.length === 0) {
      inputRef.current.value = ""
      inputRef.current.click()
    }
  }

  const hasFiles = fileItems.length > 0

  return (
    <NodeViewWrapper
      className="tiptap-image-upload"
      tabIndex={0}
      onClick={handleClick}
    >
      {!hasFiles && (
        <ImageUploadDragArea onFile={handleUpload}>
          <DropZoneContent maxSize={maxSize} limit={limit} />
        </ImageUploadDragArea>
      )}

      {hasFiles && (
        <div className="tiptap-image-upload-previews">
          {fileItems.length > 1 && (
            <div className="tiptap-image-upload-header">
              <span>{t('common.uploading_files', { count: fileItems.length })}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  clearAllFiles()
                }}
              >
                {t('common.clear_all', 'Clear all')}
              </Button>
            </div>
          )}
          {fileItems.map((fileItem) => (
            <ImageUploadPreview
              key={fileItem.id}
              fileItem={fileItem}
              onRemove={() => removeFileItem(fileItem.id)}
            />
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        name="file"
        accept={accept}
        type="file"
        multiple={limit > 1}
        aria-label={t('editor.upload_images', 'Upload images')}
        onChange={handleChange}
        onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
      />
    </NodeViewWrapper>
  )
}
