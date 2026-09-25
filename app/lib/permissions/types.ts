export type MediaPermissionKind = 'microphone' | 'screen';

export type MediaPermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface MediaPermissionsSnapshot {
  /** False on platforms where the OS manages media access outside Dome. */
  managedByApp: boolean;
  microphone: MediaPermissionStatus;
  screen: MediaPermissionStatus;
}

export interface MediaPermissionRequestResult {
  status: MediaPermissionStatus;
  openedSettings: boolean;
}
