import 'package:url_launcher/url_launcher.dart';

class WhatsAppService {
  /// Opens WhatsApp to chat with rider, vendor, or share tracking
  static Future<bool> openWhatsApp({required String phone, required String message}) async {
    final cleanPhone = phone.replaceAll(RegExp(r'[^0-9]'), '');
    final encodedMessage = Uri.encodeComponent(message);
    final url = cleanPhone.isNotEmpty
        ? 'https://wa.me/$cleanPhone?text=$encodedMessage'
        : 'https://wa.me/?text=$encodedMessage';
    
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return false;
  }

  /// 1-Click WhatsApp Order Status Share
  static Future<void> shareOrderStatus({
    required String orderRef,
    required String status,
    required String customerPhone,
  }) async {
    final msg = "🚀 *RushPoint Delivery Update*\n"
        "📦 *Order:* $orderRef\n"
        "📍 *Status:* $status\n"
        "🔗 *Live GPS Tracking:* https://rushingpoint.com/app\n"
        "_Every Delivery, On Point._";
    await openWhatsApp(phone: customerPhone, message: msg);
  }
}
