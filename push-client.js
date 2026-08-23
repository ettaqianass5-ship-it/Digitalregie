/* Digital Regie — Push notifications & sync Supabase
   À inclure APRÈS le script principal de index.html :
   <script src="push-client.js"></script>
   (a besoin des variables globales `sb`, `settings`, `employees`, `now`
    déjà définies dans index.html) */

const VAPID_PUBLIC_KEY = "BBaOLd1UtNTKpkwXBdxocTCKt5eyL8UOAz6omBZNRFX3NLq5hrUWS2Nw0Mq200lahhEW3HsFG68SclYFmlpG04w";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("sw.js");
  } catch (e) {
    console.warn("SW registration failed", e);
    return null;
  }
}

async function subscribeToPush() {
  if (!("PushManager" in window) || !sb) return;
  const reg = await registerServiceWorker();
  if (!reg) return;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e) {
      console.warn("Push subscribe failed", e);
      return;
    }
  }

  const json = sub.toJSON();
  try {
    await sb.from("push_subscriptions").upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        device_label: navigator.userAgent.slice(0, 120),
      },
      { onConflict: "endpoint" }
    );
  } catch (e) {
    console.warn("Saving subscription failed", e);
  }
}

async function enablePushNotifications() {
  await subscribeToPush();
}

async function syncStateToSupabase() {
  if (!sb) return;
  try {
    await sb.from("app_settings").upsert({
      id: 1,
      restaurant_name: settings.restaurantName || "",
      orange_min: settings.orangeMin,
      red_min: settings.redMin,
      break_max_min: settings.breakMaxMin,
      break_warn_min: settings.breakWarnMin,
      break_anomaly_min: settings.breakAnomalyMin,
      resume_min_break_min: settings.resumeMinBreakMin,
      updated_at: new Date().toISOString(),
    });

    if (employees.length) {
      const rows = employees.map((e) => ({
        id: e.id,
        name: e.name,
        badge: e.badge || null,
        objective_hours: e.objectiveHours,
        planned_start: e.plannedStart || null,
        accumulated_ms: e.accumulatedMs || 0,
        running_since: e.runningSince || null,
        pause_since: e.pauseSince || null,
        closed_at: e.closedAt || null,
        early_closed: !!e.earlyClosed,
        break_taken: !!e.breakTaken,
        acknowledged: !!e.acknowledged,
        break_violations: e.breakViolations || 0,
        updated_at: new Date().toISOString(),
      }));
      await sb.from("employees").upsert(rows, { onConflict: "id" });
    }
  } catch (e) {
    console.warn("Sync to Supabase failed", e);
  }
}

setInterval(syncStateToSupabase, 15000);

registerServiceWorker();
