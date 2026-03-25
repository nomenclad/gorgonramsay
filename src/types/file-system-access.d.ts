/**
 * Type declarations for the File System Access API.
 * These APIs are available in Chromium-based browsers but not yet
 * in the default TypeScript DOM lib.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemDirectoryHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }): Promise<FileSystemDirectoryHandle>;
}
