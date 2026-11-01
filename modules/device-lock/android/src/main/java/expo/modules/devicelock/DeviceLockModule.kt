package expo.modules.devicelock

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceLockModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val policyManager: DevicePolicyManager
    get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

  private val adminComponent: ComponentName
    get() = ComponentName(context, PlayTimeAdminReceiver::class.java)

  override fun definition() = ModuleDefinition {
    Name("DeviceLock")

    Function("isLockAllowed") {
      policyManager.isAdminActive(adminComponent)
    }

    // Opens Android's own consent screen. Only a person can approve this.
    Function("requestLockPermission") { explanation: String ->
      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
        .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, explanation)
      appContext.currentActivity?.startActivity(intent)
    }

    Function("removeLockPermission") {
      if (policyManager.isAdminActive(adminComponent)) policyManager.removeActiveAdmin(adminComponent)
    }

    Function("lockPhone") {
      if (!policyManager.isAdminActive(adminComponent)) return@Function false
      policyManager.lockNow()
      true
    }

    AsyncFunction("closeApp") {
      appContext.currentActivity?.finishAndRemoveTask()
      Unit
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setImmersive") { enabled: Boolean ->
      val window = appContext.currentActivity?.window ?: return@AsyncFunction
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      if (enabled) {
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
      } else {
        controller.show(WindowInsetsCompat.Type.systemBars())
      }
    }.runOnQueue(Queues.MAIN)

    // Android screen pinning: the system shows its own confirmation, and a person can always exit it.
    AsyncFunction("setPinned") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      if (enabled) activity.startLockTask() else activity.stopLockTask()
    }.runOnQueue(Queues.MAIN)
  }
}
