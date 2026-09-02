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
  // ignore: prefer_final_fields
  double _platformFee = 150.0;
  double _discount = 0.0;
  double _total = 0.0;

  // ignore: prefer_final_fields
  double _customerLat = 12.9908;
  // ignore: prefer_final_fields
  double _customerLon = 7.6018;
  double _distanceKm = 0.0;
  int _estimatedMinutes = 0;
  String _routingEngine = "OSRM_ROAD_ROUTER";

  bool _isCalculatingRoute = false;
  bool _isPlacingOrder = false;
  bool _hasLocationSet = false;
  String? _promoMessage;

  @override
  void initState() {
    super.initState();
    _calculateSubtotal();
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
          _discount = (res['discount_applied'] as num?)?.toDouble() ?? 0.0;
          if (_deliveryFee != null) {
            _deliveryFee = (res['final_delivery_fee'] as num?)?.toDouble() ?? _deliveryFee;
          }
          _promoMessage = res['message'];
          _updateTotal();
        });
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['detail'] ?? 'Invalid promo code.')));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to apply promo code.')));
    }
  }

  Future<void> _placeOrder() async {
    if (!_hasLocationSet || _addressController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('⚠️ Please select or set your delivery location first!')),
      );
      return;
    }

    if (_phoneController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('⚠️ Please enter customer contact phone number!')),
      );
      return;
    }

    setState(() => _isPlacingOrder = true);
    try {
      final payload = {
        'store_id': widget.store['id'],
        'delivery_address': _addressController.text.trim(),
        'delivery_phone': _phoneController.text.trim(),
        'delivery_lat': _customerLat,
        'delivery_lng': _customerLon,
        'payment_method': 'WALLET',
        'items': widget.items.map((i) => {
          'product_id': i['id'],
          'quantity': i['quantity'] ?? 1,
        }).toList(),
      };

      final res = await ApiService.post('/api/marketplace/orders', payload);

      if (res['success'] == true) {
        final orderRef = res['order_ref'] ?? 'RP-ORD';
        if (!mounted) return;
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Text('🎉 Order Placed Successfully!'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Order Ref: $orderRef', style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('Your 4-digit Delivery PIN is: ${res['pod_otp'] ?? '----'}', style: const TextStyle(fontSize: 16, color: Color(0xFF7F1D1D), fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                const Text('Funds are held safely in escrow until you provide the PIN to your rider upon arrival.'),
              ],
            ),
            actions: [
              TextButton.icon(
                icon: const Icon(Icons.chat, color: Color(0xFF25D366)),
                label: const Text('Share on WhatsApp'),
                onPressed: () {
                  WhatsAppService.shareOrderStatus(
                    orderRef: orderRef,
                    status: 'Preparing Order at Store',
                    customerPhone: _phoneController.text.trim(),
                  );
                },
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  Navigator.pop(context);
                },
                child: const Text('Back to Home'),
              ),
            ],
          ),
        );
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['detail'] ?? 'Order failed.')));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network error. Check wallet balance.')));
    } finally {
      setState(() => _isPlacingOrder = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout & Escrow Payment'),
        backgroundColor: const Color(0xFF7F1D1D),
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Store Info Card
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(14.0),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10)),
                      child: const Center(child: Text('🏪', style: TextStyle(fontSize: 22))),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.store['store_name'] ?? 'Store', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                          Text('📍 ${widget.store['address'] ?? 'Store Location'}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Delivery Location Picker Section
            const Text('1. Set Delivery Location', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF7F1D1D))),
            const SizedBox(height: 8),
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              child: Padding(
                padding: const EdgeInsets.all(14.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _addressController,
                      decoration: InputDecoration(
                        labelText: 'Delivery Address / Landmark',
                        prefixIcon: const Icon(Icons.location_on, color: Color(0xFF7F1D1D)),
                        hintText: 'e.g. Ring Road, Katsina City Gate',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.my_location, size: 16),
                            label: const Text('Use Phone GPS Location', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            onPressed: () {
                              _fetchRoadDistanceQuote(13.0050, 7.6180, 'Katsina City Hub, Ring Road');
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Quick location chips
                    Wrap(
                      spacing: 6,
                      children: [
                        ActionChip(
                          avatar: const Icon(Icons.place, size: 14),
                          label: const Text('Katsina GRA', style: TextStyle(fontSize: 11)),
                          onPressed: () => _fetchRoadDistanceQuote(12.9820, 7.5950, 'GRA Main Road, Katsina'),
                        ),
                        ActionChip(
                          avatar: const Icon(Icons.place, size: 14),
                          label: const Text('Central Market', style: TextStyle(fontSize: 11)),
                          onPressed: () => _fetchRoadDistanceQuote(12.9908, 7.6018, 'Central Commercial Market, Katsina'),
                        ),
                        ActionChip(
                          avatar: const Icon(Icons.place, size: 14),
                          label: const Text('Batagarawa Junction', style: TextStyle(fontSize: 11)),
                          onPressed: () => _fetchRoadDistanceQuote(12.9500, 7.5800, 'Batagarawa Junction, Katsina'),
                        ),
                      ],
                    ),

                    if (_isCalculatingRoute)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 10.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                            SizedBox(width: 10),
                            Text('Calculating live road distance & fee...', style: TextStyle(fontSize: 12, color: Colors.blue)),
                          ],
                        ),
                      ),

                    if (_hasLocationSet)
                      Container(
                        margin: const EdgeInsets.only(top: 10),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.green.shade200)),
                        child: Row(
                          children: [
                            const Text('🗺️', style: TextStyle(fontSize: 20)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'Road Distance: $_distanceKm km (~$_estimatedMinutes mins) via $_routingEngine',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF166534)),
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      Container(
                        margin: const EdgeInsets.only(top: 10),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(10)),
                        child: const Text(
                          'ℹ️ Delivery fee will calculate automatically once location is selected above.',
                          style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Contact Phone
            const Text('2. Contact Phone Number', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF7F1D1D))),
            const SizedBox(height: 8),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Recipient Phone Number',
                prefixIcon: const Icon(Icons.phone),
                hintText: '+2348031234567',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 16),

            // Promo Code Section
            const Text('3. Apply Promo Code / Flash Sale', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF7F1D1D))),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _promoController,
                    decoration: InputDecoration(
                      hintText: 'e.g. FLASH20',
                      prefixIcon: const Icon(Icons.local_offer_outlined),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: _applyPromo,
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7F1D1D), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15)),
                  child: const Text('Apply'),
                ),
              ],
            ),
            if (_promoMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 6.0),
                child: Text(_promoMessage!, style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            const SizedBox(height: 20),

            // Summary Breakdown Card
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              elevation: 3,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    _buildRow('Items Subtotal (${widget.items.length} items)', '₦${_subtotal.toStringAsFixed(2)}'),
                    const SizedBox(height: 8),
                    _buildRow(
                      'Road Delivery Fee',
                      _hasLocationSet ? '₦${_deliveryFee!.toStringAsFixed(2)}' : 'Select Location ➔',
                      isHighlight: !_hasLocationSet,
                    ),
                    const SizedBox(height: 8),
                    _buildRow('Escrow Platform Fee', _hasLocationSet ? '₦${_platformFee.toStringAsFixed(2)}' : '₦0.00'),
                    if (_discount > 0) ...[
                      const SizedBox(height: 8),
                      _buildRow('Promo Discount', '- ₦${_discount.toStringAsFixed(2)}', isDiscount: true),
                    ],
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total Amount', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        Text(
                          '₦${_total.toStringAsFixed(2)}',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF7F1D1D)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Place Order Button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _isPlacingOrder ? null : _placeOrder,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF7F1D1D),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: _isPlacingOrder
                    ? const CircularProgressIndicator(color: Colors.white)
                    : Text(
                        _hasLocationSet ? 'Pay with Wallet Escrow (₦${_total.toStringAsFixed(2)}) 🔒' : 'Set Location to Complete Order 📍',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value, {bool isDiscount = false, bool isHighlight = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: Colors.grey.shade700, fontSize: 13)),
        Text(
          value,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: isDiscount
                ? Colors.green
                : isHighlight
                    ? Colors.orange.shade800
                    : Colors.black87,
          ),
        ),
      ],
    );
  }
}
