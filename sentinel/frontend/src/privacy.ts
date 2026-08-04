const KEY = 'automaton-sentinel-privacy'

export interface PrivacyLabels {
  host(value: string): string
  container(value: string, index: number): string
  image(value: string, index: number): string
  filesystem(value: string, index: number): string
}

export function privacyLabels(enabled: boolean): PrivacyLabels {
  return {
    host: (value) => enabled ? 'Production Host' : value,
    container: (value, index) => enabled ? `Container ${String(index + 1).padStart(2, '0')}` : value,
    image: (value, index) => enabled ? `private/image-${index + 1}:stable` : value,
    filesystem: (value, index) => enabled ? (index === 0 ? '/system' : `/volume-${index + 1}`) : value,
  }
}

export function loadPrivacy(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(KEY) === 'true'
}

export function savePrivacy(enabled: boolean, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(KEY, String(enabled))
}
