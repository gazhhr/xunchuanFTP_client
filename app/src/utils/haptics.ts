import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = () => {
  return typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform();
};

/**
 * Light impact feedback - for button clicks, selections
 */
export async function hapticLight() {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Ignore haptics errors
  }
}

/**
 * Medium impact feedback - for important actions
 */
export async function hapticMedium() {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Ignore
  }
}

/**
 * Heavy impact feedback - for errors, warnings
 */
export async function hapticHeavy() {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    // Ignore
  }
}

/**
 * Success notification feedback
 */
export async function hapticSuccess() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Ignore
  }
}

/**
 * Error notification feedback
 */
export async function hapticError() {
  if (!isNative()) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Ignore
  }
}

/**
 * Vibrate with pattern (fallback for web)
 */
export async function hapticVibrate(duration = 10) {
  if (!isNative()) {
    // Web fallback using navigator.vibrate
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
    return;
  }
  try {
    await Haptics.vibrate({ duration });
  } catch {
    // Ignore
  }
}
