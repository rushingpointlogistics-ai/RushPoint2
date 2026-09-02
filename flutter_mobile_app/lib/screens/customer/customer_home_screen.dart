import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/whatsapp_service.dart';
import '../auth/login_screen.dart';
import 'cart_checkout_screen.dart';

class CustomerHomeScreen extends StatefulWidget {
  const CustomerHomeScreen({super.key});

  @override
  State<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends State<CustomerHomeScreen> {
  int _currentTabIndex = 0;
  List<dynamic> _stores = [];
  List<dynamic> _products = [];
  List<dynamic> _promos = [];
  Map<String, dynamic> _wallet = {'balance': 0.0};
  bool _isLoading = true;

  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    _loadData();
    _startPromoCountdown();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  void _startPromoCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        for (var p in _promos) {
          final rem = (p['remaining_seconds'] as int?) ?? 0;
          if (rem > 0) {
            p['remaining_seconds'] = rem - 1;
            final r = rem - 1;
            p['remaining_formatted'] = "${(r ~/ 3600).toString().padLeft(2, '0')}:${((r % 3600) ~/ 60).toString().padLeft(2, '0')}:${(r % 60).toString().padLeft(2, '0')}";
          } else {
            p['remaining_formatted'] = "00:00:00";
          }
        }
      });
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final sRes = await ApiService.get('/api/marketplace/stores');
      final pRes = await ApiService.get('/api/products/');
      final wRes = await ApiService.get('/api/finance/wallet/me');
      final promoRes = await ApiService.get('/api/promos/active');

      setState(() {
        _stores = sRes['stores'] ?? [];
        _products = pRes['products'] ?? [];
        _wallet = wRes['wallet'] ?? {'balance': 0.0};
        _promos = promoRes['promos'] ?? [];
      });
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('RushPoint Marketplace'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline),
            tooltip: 'WhatsApp Support',
            onPressed: () {
              WhatsAppService.openWhatsApp(phone: '+2348000000000', message: 'Hello RushPoint Support, I need assistance.');
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ApiService.logout();
              if (!mounted) return;
              // ignore: use_build_context_synchronously
              Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Temu-Style Live Flash Sale & Black Friday Countdown Banner
                    if (_promos.isNotEmpty)
                      ..._promos.map((promo) => Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [Color(0xFF991B1B), Color(0xFFDC2626)]),
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [BoxShadow(color: Colors.red.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 4))],
                        ),
                        child: Row(
                          children: [
                            const Text('⚡', style: TextStyle(fontSize: 32)),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(promo['banner_label'] ?? 'FLASH SALE', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14)),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(color: Colors.black45, borderRadius: BorderRadius.circular(20)),
                                        child: Text('⏱️ ${promo['remaining_formatted'] ?? '00:00:00'}', style: const TextStyle(color: Color(0xFFFECDD3), fontWeight: FontWeight.bold, fontSize: 11)),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(promo['title'] ?? 'Limited Time Discount', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                                  Text('Use code: ${promo['promo_ref']} at checkout', style: const TextStyle(color: Color(0xFFFFE4E6), fontSize: 11)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      )),

                    // Wallet Balance Card
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF2B0008), Color(0xFF7F1D1D)]),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('My Wallet Balance', style: TextStyle(color: Colors.white70, fontSize: 12)),
                              Text('₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                                  style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF7F1D1D)),
                            icon: const Icon(Icons.add_card, size: 16),
                            label: const Text('Top Up'),
                            onPressed: () {},
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Verified Storefronts
                    const Text('Verified Merchant Stores 🏬', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 120,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: _stores.length,
                        itemBuilder: (context, index) {
                          final st = _stores[index];
                          return InkWell(
                            onTap: () {},
                            child: Card(
                              margin: const EdgeInsets.only(right: 12),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              child: Container(
                                width: 140,
                                padding: const EdgeInsets.all(10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(st['store_name'] ?? 'Store', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold)),
                                    const SizedBox(height: 4),
                                    Text(st['category'] ?? 'Retail', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                    const Spacer(),
                                    const Text('🟢 Open', style: TextStyle(fontSize: 11, color: Colors.green, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Products Grid
                    const Text('Featured Products 🛍️', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        childAspectRatio: 0.75,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                      itemCount: _products.length,
                      itemBuilder: (context, index) {
                        final p = _products[index];
                        return Card(
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: Padding(
                            padding: const EdgeInsets.all(8.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Container(
                                    decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(8)),
                                    child: const Center(child: Icon(Icons.shopping_bag_outlined, size: 40, color: Colors.grey)),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(p['name'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold)),
                                Text('₦${p['price'] ?? 0}', style: const TextStyle(color: Color(0xFF7F1D1D), fontWeight: FontWeight.bold)),
                                const SizedBox(height: 6),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton(
                                    style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 8)),
                                    onPressed: () {
                                      final storeObj = _stores.isNotEmpty ? _stores[0] : {'id': p['store_id'], 'store_name': 'Vendor Store'};
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => CartCheckoutScreen(
                                            store: storeObj,
                                            items: [
                                              {
                                                'id': p['id'],
                                                'name': p['name'],
                                                'price': p['price'],
                                                'quantity': 1,
                                              }
                                            ],
                                          ),
                                        ),
                                      );
                                    },
                                    child: const Text('Buy Now ⚡', style: TextStyle(fontSize: 12)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTabIndex,
        selectedItemColor: const Color(0xFF7F1D1D),
        onTap: (idx) => setState(() => _currentTabIndex = idx),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.storefront), label: 'Market'),
          BottomNavigationBarItem(icon: Icon(Icons.local_shipping), label: 'Waybill'),
          BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
        ],
      ),
    );
  }
}
