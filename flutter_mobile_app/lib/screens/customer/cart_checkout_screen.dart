// ignore_for_file: use_build_context_synchronously, prefer_const_constructors, prefer_const_literals_to_create_immutables, unused_field
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/whatsapp_service.dart';

class CartCheckoutScreen extends StatefulWidget {
  final Map<String, dynamic> store;
  final List<Map<String, dynamic>> items;

  const CartCheckoutScreen({super.key, required this.store, required this.items});

  @override
  State<CartCheckoutScreen> createState() => _CartCheckoutScreenState();
}

class _CartCheckoutScreenState extends State<CartCheckoutScreen> {
  final _addressController = TextEditingController();
  final _phoneController = TextEditingController();
  final _promoController = TextEditingController();

  double _subtotal = 0.0;
  double? _deliveryFee; // null until customer sets location
  final double _platformFee = 150.0;
  double _discount = 0.0;
  double _total = 0.0;

  double _customerLat = 12.9908;
  double _customerLon = 7.6018;
  double _distanceKm = 0.0;
  int _estimatedMinutes = 0;
  String _routingEngine = "OSRM_ROAD_ROUTER";

  bool _isCalculatingRoute = false;
  bool _isPlacingOrder = false;
  bool _hasLocationSet = false;
  String? _promoMessage;

  // Multi-Payment Options: WALLET, BANK_TRANSFER, CARD, USSD, QR_CODE
  String _selectedPaymentMethod = "WALLET";

  // Dedicated Virtual Account for Bank Transfers
  Map<String, dynamic>? _dedicatedAccount;

  @override
  void initState() {
    super.initState();
    _calculateSubtotal();
    _fetchDedicatedAccount();
  }

  Future<void> _fetchDedicatedAccount() async {
    try {
      final res = await ApiService.get('/api/finance/wallet/dedicated-account');
      if (res['success'] == true && res['dedicated_account'] != null) {
        setState(() {
          _dedicatedAccount = res['dedicated_account'];
        });
      }
    } catch (_) {}
  }

  void _calculateSubtotal() {
    double sum = 0.0;
    for (var item in widget.items) {
      final price = (item['price'] as num?)?.toDouble() ?? 0.0;
      final qty = (item['quantity'] as num?)?.toInt() ?? 1;
      sum += price * qty;
    }
    _subtotal = sum;
    _updateTotal();
  }

  void _updateTotal() {
    final fee = _deliveryFee ?? 0.0;
    _total = (_subtotal - _discount) + fee + (_hasLocationSet ? _platformFee : 0.0);
    if (_total < 0) _total = 0.0;
  }

  Future<void> _fetchRoadDistanceQuote(double lat, double lon, String addressName) async {
    setState(() {
      _isCalculatingRoute = true;
      _customerLat = lat;
      _customerLon = lon;
      _addressController.text = addressName;
    });

    try {
      final res = await ApiService.post('/api/marketplace/calculate-delivery-quote', {
        'store_id': widget.store['id'],
        'customer_lat': lat,
        'customer_lon': lon,
        'cargo_weight_kg': 2.0,
      });

      if (res['success'] == true && res['routing'] != null) {
        final r = res['routing'];
        setState(() {
          _distanceKm = (r['distance_km'] as num?)?.toDouble() ?? 1.8;
          _estimatedMinutes = (r['estimated_duration_minutes'] as num?)?.toInt() ?? 15;
          _routingEngine = r['engine'] ?? 'OSRM_ROAD_ROUTER';
          final pricing = r['pricing'] ?? {};
          _deliveryFee = (pricing['total_delivery_fee'] as num?)?.toDouble() ?? 1200.0;
          _hasLocationSet = true;
          _updateTotal();
        });
      }
    } catch (_) {}
    setState(() => _isCalculatingRoute = false);
  }

  Future<void> _handleGeocodeManualInput(String query) async {
    if (query.trim().isEmpty) return;
    setState(() => _isCalculatingRoute = true);
    try {
      final res = await ApiService.get('/api/marketplace/geocode?query=${Uri.encodeComponent(query)}');
      if (res['success'] == true && res['location'] != null) {
        final loc = res['location'];
        final lat = (loc['latitude'] as num).toDouble();
        final lon = (loc['longitude'] as num).toDouble();
        final formatted = loc['formatted_address'] ?? query;
        await _fetchRoadDistanceQuote(lat, lon, formatted);
      }
    } catch (_) {}
    setState(() => _isCalculatingRoute = false);
  }

  Future<void> _applyPromo() async {
    final code = _promoController.text.trim();
    if (code.isEmpty) return;

    try {
      final res = await ApiService.post('/api/promos/apply', {
        'promo_code': code,
        'order_subtotal': _subtotal,
        'delivery_fee': _deliveryFee ?? 1200.0,
        'store_id': widget.store['id'],
      });

      if (res['success'] == true) {
        setState(() {
          _discount = (res['discount_amount'] as num?)?.toDouble() ?? 0.0;
          _promoMessage = '✅ ${res['title']}: -₦${_discount.toStringAsFixed(2)} applied!';
          _updateTotal();
        });
      } else {
        setState(() {
          _promoMessage = '❌ ${res['detail'] ?? "Invalid promo code"}';
        });
      }
    } catch (_) {
      setState(() {
        _promoMessage = '❌ Could not apply promo code.';
      });
    }
  }

  Future<void> _placeOrder() async {
    if (!_hasLocationSet || _deliveryFee == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('📍 Please select or enter your delivery destination first to calculate road delivery fee.'),
          backgroundColor: Color(0xFFB91C1C),
        ),
      );
      return;
    }

    setState(() => _isPlacingOrder = true);

    try {
      final payload = {
        'store_id': widget.store['id'],
        'items': widget.items,
        'delivery_address': _addressController.text.trim(),
        'delivery_lat': _customerLat,
        'delivery_lng': _customerLon,
        'customer_phone': _phoneController.text.trim(),
        'payment_method': _selectedPaymentMethod,
      };

      final res = await ApiService.post('/api/marketplace/checkout', payload);

      if (res['success'] == true) {
        final orderRef = res['order_ref'] ?? 'RP-ORD-SUCCESS';
        final podOtp = res['pod_otp'] ?? '8899';
        _showSuccessDialog(orderRef, podOtp);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['detail'] ?? 'Failed to place order.'), backgroundColor: Colors.red),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error connecting to RushPoint servers.'), backgroundColor: Colors.red),
      );
    } finally {
      setState(() => _isPlacingOrder = false);
    }
  }

  void _showSuccessDialog(String orderRef, String podOtp) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: const [
            Icon(Icons.check_circle, color: Colors.green, size: 28),
            SizedBox(width: 8),
            Text('Order Confirmed! 🎉', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Your order $orderRef has been placed successfully and is being prepared.', style: const TextStyle(fontSize: 13, color: Colors.black87)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFFCA5A5), style: BorderStyle.solid),
              ),
              child: Column(
                children: [
                  const Text('🔐 4-DIGIT DELIVERY PIN (POD OTP)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF7F1D1D), letterSpacing: 0.5)),
                  const SizedBox(height: 6),
                  Text(podOtp, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Color(0xFFB91C1C), letterSpacing: 6)),
                  const SizedBox(height: 4),
                  const Text('Share this PIN with the courier ONLY when you receive your physical goods.', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Colors.black54)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                WhatsAppService.shareOrderStatus(
                  orderRef: orderRef,
                  status: 'PREPARING (PIN: $podOtp)',
                  customerPhone: _phoneController.text.trim(),
                );
              },
              icon: const Icon(Icons.share, size: 18),
              label: const Text('Share Status on WhatsApp 💬'),
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF059669)),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx); // Close dialog
              Navigator.pop(context); // Return to market
            },
            child: const Text('Done ➔', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cart & Road Checkout 🛒', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: const Color(0xFF7F1D1D),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Store Info Pill
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 6)],
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(10)),
                    child: const Center(child: Text('🏪', style: TextStyle(fontSize: 20))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.store['store_name'] ?? 'Merchant Stall', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        Text('📍 ${widget.store['address'] ?? 'Katsina / Lagos'}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Step 1: Destination Location Picker
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _hasLocationSet ? const Color(0xFF059669) : const Color(0xFFE2E8F0), width: _hasLocationSet ? 1.5 : 1),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('📍 Delivery Destination', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF1E293B))),
                      if (_isCalculatingRoute)
                        const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF7F1D1D)))
                      else if (_hasLocationSet)
                        const Text('✅ Fee Calculated', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF059669)))
                      else
                        const Text('⚠️ Required', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFFB91C1C))),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Location manual text input with map geocoding
                  TextField(
                    controller: _addressController,
                    onSubmitted: _handleGeocodeManualInput,
                    decoration: InputDecoration(
                      hintText: 'Type address e.g. Katsina City Gate, GRA...',
                      prefixIcon: const Icon(Icons.location_on_outlined, color: Color(0xFF7F1D1D)),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.search, color: Color(0xFF7F1D1D)),
                        onPressed: () => _handleGeocodeManualInput(_addressController.text),
                      ),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Quick Area Landmark Buttons
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      _areaChip('City Gate', 13.0050, 7.6180, 'Katsina City Gate & Ring Road Hub'),
                      _areaChip('GRA Katsina', 12.9820, 7.5950, 'GRA Residential Main Road, Katsina'),
                      _areaChip('Central Market', 12.9908, 7.6018, 'Katsina Central Commercial Market'),
                      _areaChip('Batagarawa', 12.9500, 7.5800, 'Batagarawa Commercial Junction'),
                    ],
                  ),

                  if (_hasLocationSet) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFBBF7D0)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.route, color: Color(0xFF059669), size: 18),
                              const SizedBox(width: 6),
                              Text('$_distanceKm km (~$_estimatedMinutes mins)', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF166534))),
                            ],
                          ),
                          Text('₦${_deliveryFee?.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: Color(0xFF059669))),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Step 2: Multi-Payment Method Selector
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8)],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('💳 Choose Payment Method', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF1E293B))),
                  const SizedBox(height: 12),

                  _paymentMethodTile('WALLET', '🔒 Wallet Escrow Balance', 'Instant clearance • Zero processing fee', Icons.account_balance_wallet_outlined),
                  _paymentMethodTile('BANK_TRANSFER', '🏦 Direct Bank Transfer', 'Transfer to your dedicated virtual account', Icons.account_balance_outlined),
                  _paymentMethodTile('CARD', '💳 Debit / Credit Card', 'Mastercard, Visa, Verve via Flutterwave', Icons.credit_card_outlined),
                  _paymentMethodTile('USSD', '📱 USSD Banking Code', '*737#, *901#, *894# instant payment', Icons.phone_android_outlined),
                  _paymentMethodTile('QR_CODE', '🔳 Scan to Pay (QR Code)', 'Quick scan with any bank mobile app', Icons.qr_code_scanner_outlined),

                  if (_selectedPaymentMethod == 'BANK_TRANSFER' && _dedicatedAccount != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEFF6FF),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFBFDBFE)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('YOUR DEDICATED VIRTUAL ACCOUNT:', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF1E40AF))),
                          const SizedBox(height: 4),
                          Text('Bank: ${_dedicatedAccount!['bank_name']}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                          Text('Account No: ${_dedicatedAccount!['account_number']}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF1E3A8A), letterSpacing: 1)),
                          Text('Account Name: ${_dedicatedAccount!['account_name']}', style: const TextStyle(fontSize: 12, color: Colors.black87)),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Promo Code Box
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('⚡ Apply Flash Promo / Coupon', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _promoController,
                          textCapitalization: TextCapitalization.characters,
                          decoration: InputDecoration(
                            hintText: 'e.g. FLASH20',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(onPressed: _applyPromo, child: const Text('Apply')),
                    ],
                  ),
                  if (_promoMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(_promoMessage!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Price Summary Breakdown
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Column(
                children: [
                  _summaryRow('Products Subtotal', '₦${_subtotal.toStringAsFixed(2)}'),
                  if (_discount > 0)
                    _summaryRow('Promo Discount', '-₦${_discount.toStringAsFixed(2)}', color: Colors.green),
                  _summaryRow(
                    'Road Delivery Fee',
                    _deliveryFee != null ? '₦${_deliveryFee!.toStringAsFixed(2)}' : 'Select Location ➔',
                    color: _deliveryFee != null ? const Color(0xFF059669) : Colors.orange,
                  ),
                  _summaryRow('Platform Escrow Fee', _hasLocationSet ? '₦${_platformFee.toStringAsFixed(2)}' : '---'),
                  const Divider(height: 20),
                  _summaryRow('Total Amount', '₦${_total.toStringAsFixed(2)}', isBold: true, fontSize: 18, color: const Color(0xFF7F1D1D)),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Pay / Place Order Button
            ElevatedButton(
              onPressed: _isPlacingOrder ? null : _placeOrder,
              style: ElevatedButton.styleFrom(
                backgroundColor: _hasLocationSet ? const Color(0xFF7F1D1D) : Colors.grey,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _isPlacingOrder
                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : Text(
                      _hasLocationSet ? 'Confirm & Place Order (₦${_total.toStringAsFixed(2)}) 🔒' : 'Set Location to Calculate Fee 📍',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
            ),
            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget _areaChip(String label, double lat, double lon, String fullName) {
    return ActionChip(
      avatar: const Icon(Icons.place, size: 14, color: Color(0xFF7F1D1D)),
      label: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
      backgroundColor: const Color(0xFFF1F5F9),
      onPressed: () => _fetchRoadDistanceQuote(lat, lon, fullName),
    );
  }

  Widget _paymentMethodTile(String method, String title, String subtitle, IconData icon) {
    final isSelected = _selectedPaymentMethod == method;
    return InkWell(
      onTap: () => setState(() => _selectedPaymentMethod = method),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFFEF2F2) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSelected ? const Color(0xFFB91C1C) : const Color(0xFFE2E8F0), width: isSelected ? 1.5 : 1),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? const Color(0xFFB91C1C) : Colors.grey, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isSelected ? const Color(0xFF7F1D1D) : Colors.black87)),
                  Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle, color: Color(0xFFB91C1C), size: 18),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value, {bool isBold = false, double fontSize = 14, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: fontSize, fontWeight: isBold ? FontWeight.bold : FontWeight.normal, color: Colors.black87)),
          Text(value, style: TextStyle(fontSize: fontSize, fontWeight: isBold ? FontWeight.w900 : FontWeight.bold, color: color ?? Colors.black87)),
        ],
      ),
    );
  }
}
