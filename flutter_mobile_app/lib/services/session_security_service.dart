import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class SessionSecurityService {
  static const int autoLockTimeoutSeconds = 30; // Auto-lock after 30 seconds of background / sleep
  static int? _backgroundTimestamp;
  static bool isLocked = false;

  static void onAppPaused() {
    _backgroundTimestamp = DateTime.now().millisecondsSinceEpoch;
  }

  static bool shouldLockOnResume() {
    if (_backgroundTimestamp == null) return false;
    final now = DateTime.now().millisecondsSinceEpoch;
    final diffSeconds = (now - _backgroundTimestamp!) ~/ 1000;
    _backgroundTimestamp = null;
    return diffSeconds >= autoLockTimeoutSeconds;
  }

  static Future<bool> hasSavedPin() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('rp_quick_pin') != null;
  }

  static Future<void> saveQuickPin(String pin) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('rp_quick_pin', pin);
  }

  static Future<bool> verifyQuickPin(String pin) async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('rp_quick_pin');
    if (saved != null && saved == pin) return true;

    // Also check backend
    try {
      final res = await ApiService.post('/api/finance/wallet/verify-security-pin', {'pin': pin});
      if (res['verified'] == true) {
        await saveQuickPin(pin);
        return true;
      }
    } catch (_) {}
    return false;
  }
}
