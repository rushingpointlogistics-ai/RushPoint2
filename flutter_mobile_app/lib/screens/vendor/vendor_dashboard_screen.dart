// ignore_for_file: use_build_context_synchronously, deprecated_member_use, prefer_const_constructors, prefer_const_literals_to_create_immutables
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/whatsapp_service.dart';
import '../auth/login_screen.dart';

class VendorDashboardScreen extends StatefulWidget {
  const VendorDashboardScreen({super.key});

  @override
  State<VendorDashboardScreen> createState() => _VendorDashboardScreenState();
}

class _VendorDashboardScreenState extends State<VendorDashboardScreen> {
  int _tabIdx = 0;
  Map<String, dynamic> _wallet = {'balance': 0.0};
  List<dynamic> _orders = [];
  List<dynamic> _products = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    try {
      final wRes = await ApiService.get('/api/finance/wallet/me');
      final oRes = await ApiService.get('/api/orders/vendor/my-orders');
      final pRes = await ApiService.get('/api/products/my-store');
      setState(() {
        _wallet = wRes['wallet'] ?? {'balance': 0.0};
        _orders = oRes['orders'] ?? [];
        _products = pRes['products'] ?? [];
      });
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  Future<void> _updateOrderStatus(String orderId, String newStatus) async {
    try {
      final res = await ApiService.post('/api/orders/$orderId/update-status', {'status': newStatus});
      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order updated to $newStatus ✅'), backgroundColor: Colors.green),
        );
        _loadAll();
      }
    } catch (_) {}
  }

  void _showAddProductDialog() {
    final nameCtrl = TextEditingController();
    final priceCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final stockCtrl = TextEditingController(text: '10');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add New Product'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Product Name *', border: OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: descCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: priceCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Price (₦) *', prefixText: '₦', border: OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: stockCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Stock Quantity', border: OutlineInputBorder())),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              if (nameCtrl.text.trim().isEmpty || priceCtrl.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Product name and price are required!')),
                );
                return;
              }
              try {
                final res = await ApiService.post('/api/products/', {
                  'name': nameCtrl.text.trim(),
                  'description': descCtrl.text.trim(),
                  'price': double.tryParse(priceCtrl.text.trim()) ?? 0.0,
                  'stock_qty': int.tryParse(stockCtrl.text.trim()) ?? 0,
                  'category_id': 'cat-groc',
                });
                if (res['success'] == true) {
                  Navigator.pop(ctx);
                  _loadAll();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Product added! ✅'), backgroundColor: Colors.green),
                  );
                }
              } catch (_) {}
            },
            child: const Text('Add Product'),
          ),
        ],
      ),
    );
  }

  void _showEditProductDialog(Map<String, dynamic> product) {
    final nameCtrl = TextEditingController(text: product['name'] ?? '');
    final priceCtrl = TextEditingController(text: '${product['price'] ?? ''}');
    final descCtrl = TextEditingController(text: product['description'] ?? '');
    final stockCtrl = TextEditingController(text: '${product['stock_qty'] ?? 0}');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Product'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Product Name', border: OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: descCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: priceCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Price (₦)', prefixText: '₦', border: OutlineInputBorder())),
              const SizedBox(height: 10),
              TextField(controller: stockCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Stock Quantity', border: OutlineInputBorder())),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              try {
                final res = await ApiService.put('/api/products/${product['id']}', {
                  'name': nameCtrl.text.trim(),
                  'description': descCtrl.text.trim(),
                  'price': double.tryParse(priceCtrl.text.trim()) ?? 0.0,
                  'stock_qty': int.tryParse(stockCtrl.text.trim()) ?? 0,
                });
                if (res['success'] == true) {
                  Navigator.pop(ctx);
                  _loadAll();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Product updated! ✅'), backgroundColor: Colors.green),
                  );
                }
              } catch (_) {}
            },
            child: const Text('Save Changes'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteProduct(String productId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Product?'),
        content: const Text('This product will be permanently removed from your store.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        await ApiService.delete('/api/products/$productId');
        _loadAll();
      } catch (_) {}
    }
  }

  Future<void> _requestWithdrawal() async {
    final amtCtrl = TextEditingController();
    final pinCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Request Bank Withdrawal 🏦'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Available: ₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF7F1D1D))),
              const SizedBox(height: 12),
              TextField(
                controller: amtCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Amount (₦)', prefixText: '₦', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: pinCtrl,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: const InputDecoration(
                  labelText: '4-Digit Security PIN',
                  prefixIcon: Icon(Icons.lock_outline),
                  border: OutlineInputBorder(),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 4),
              const Text('Enter your 4-digit transaction code to authorize.', style: TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final amt = double.tryParse(amtCtrl.text.trim()) ?? 0.0;
              final pin = pinCtrl.text.trim();
              if (amt <= 0) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter valid withdrawal amount.')));
                return;
              }
              if (pin.length != 4) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter 4-digit Security PIN.')));
                return;
              }
              try {
                final res = await ApiService.post('/api/finance/withdraw', {
                  'amount': amt,
                  'security_pin': pin,
                  'method': 'BANK_TRANSFER',
                });
                Navigator.pop(ctx);
                if (res['success'] == true) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(res['message'] ?? 'Withdrawal request submitted! ✅'), backgroundColor: Colors.green),
                  );
                  _loadAll();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(res['detail'] ?? 'Withdrawal failed. Verify PIN.'), backgroundColor: Colors.red),
                  );
                }
              } catch (_) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Failed to request withdrawal. Check balance & PIN.')),
                );
              }
            },
            child: const Text('Confirm & Withdraw 🔒'),
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardTab() {
    return RefreshIndicator(
      onRefresh: _loadAll,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Earnings Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF2B0008), Color(0xFF7F1D1D)]),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Net Merchant Earnings', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      Chip(label: Text('100% Product Price', style: TextStyle(fontSize: 10, color: Colors.white)), backgroundColor: Colors.white24),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  const Text('Escrow holds funds until delivery confirmation', style: TextStyle(color: Colors.white60, fontSize: 11)),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF7F1D1D)),
                      icon: const Icon(Icons.account_balance, size: 16),
                      label: const Text('Withdraw to Bank Account'),
                      onPressed: _requestWithdrawal,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Stats Row
            Row(
              children: [
                Expanded(child: _statCard('📦', 'Products', '${_products.length}', Colors.blue)),
                const SizedBox(width: 10),
                Expanded(child: _statCard('🛒', 'Orders', '${_orders.length}', Colors.orange)),
                const SizedBox(width: 10),
                Expanded(child: _statCard('⭐', 'Rating', '5.0', Colors.amber)),
              ],
            ),
            const SizedBox(height: 20),

            // Recent Orders Preview
            const Text('Recent Orders', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 8),
            if (_orders.isEmpty)
              Card(child: Padding(padding: const EdgeInsets.all(20), child: Center(child: Column(children: [
                const Text('📭', style: TextStyle(fontSize: 32)),
                const SizedBox(height: 6),
                const Text('No orders yet', style: TextStyle(color: Colors.grey)),
              ]))))
            else
              ..._orders.take(3).map((o) => _orderCard(o)),
          ],
        ),
      ),
    );
  }

  Widget _buildProductsTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12.0),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.add),
              label: const Text('Add New Product'),
              onPressed: _showAddProductDialog,
            ),
          ),
        ),
        Expanded(
          child: _products.isEmpty
            ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text('🛒', style: TextStyle(fontSize: 48)),
                SizedBox(height: 10),
                Text('No products yet. Add your first product!', style: TextStyle(color: Colors.grey)),
              ]))
            : ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: _products.length,
                itemBuilder: (_, i) {
                  final p = _products[i];
                  return Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: ListTile(
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: (p['image_url'] != null && (p['image_url'] as String).startsWith('http'))
                          ? Image.network(p['image_url'], width: 48, height: 48, fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(width: 48, height: 48, color: Colors.grey.shade200, child: const Icon(Icons.image)))
                          : Container(width: 48, height: 48, color: Colors.grey.shade200, child: const Icon(Icons.image)),
                      ),
                      title: Text(p['name'] ?? 'Product', style: const TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('₦${(p['price'] as num?)?.toStringAsFixed(2) ?? '0.00'}', style: const TextStyle(color: Color(0xFF7F1D1D), fontWeight: FontWeight.bold)),
                          Text('Stock: ${p['stock_qty'] ?? 0} units', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                        ],
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(icon: const Icon(Icons.edit, color: Colors.blue, size: 20), onPressed: () => _showEditProductDialog(p)),
                          IconButton(icon: const Icon(Icons.delete, color: Colors.red, size: 20), onPressed: () => _deleteProduct(p['id'] ?? '')),
                        ],
                      ),
                    ),
                  );
                },
              ),
        ),
      ],
    );
  }

  Widget _buildOrdersTab() {
    return RefreshIndicator(
      onRefresh: _loadAll,
      child: _orders.isEmpty
        ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('📭', style: TextStyle(fontSize: 48)),
            SizedBox(height: 10),
            Text('No orders yet', style: TextStyle(color: Colors.grey)),
          ]))
        : ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _orders.length,
            itemBuilder: (_, i) => _orderCard(_orders[i]),
          ),
    );
  }

  Widget _buildWalletTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF2B0008), Color(0xFF7F1D1D)]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Wallet Balance', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 4),
                Text('₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                  style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF7F1D1D)),
                    icon: const Icon(Icons.account_balance),
                    label: const Text('Withdraw Earnings to Bank'),
                    onPressed: _requestWithdrawal,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('How Your Earnings Work', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 12),
                  _infoRow('🛒', 'Customer pays for product', 'Full product price credited to your wallet'),
                  _infoRow('🔒', 'Escrow protection', 'Funds held until POD PIN confirmed by rider'),
                  _infoRow('💰', '0% commission on sales', 'You receive 100% of the product price'),
                  _infoRow('🏍️', 'Delivery paid separately', 'Delivery fee is paid by the customer directly'),
                  _infoRow('🏦', 'Bank transfers', 'Withdraw anytime to any Nigerian bank account'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _orderCard(Map<String, dynamic> o) {
    final status = o['status'] ?? 'PENDING';
    final statusColor = _statusColor(status);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(o['order_ref'] ?? 'RP-ORD', style: const TextStyle(fontWeight: FontWeight.bold)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
                  child: Text(status, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text('Total: ₦${(o['total_amount'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
              style: const TextStyle(color: Color(0xFF7F1D1D), fontWeight: FontWeight.bold, fontSize: 15)),
            Text('📍 ${o['delivery_address'] ?? 'Address not set'}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
            const SizedBox(height: 10),
            if (status == 'PENDING' || status == 'CONFIRMED')
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _updateOrderStatus(o['id'] ?? '', 'PREPARING'),
                      child: const Text('Mark Preparing', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _updateOrderStatus(o['id'] ?? '', 'READY_FOR_PICKUP'),
                      child: const Text('Ready for Rider', style: TextStyle(fontSize: 12)),
                    ),
                  ),
                ],
              ),
            if (status == 'PREPARING')
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _updateOrderStatus(o['id'] ?? '', 'READY_FOR_PICKUP'),
                  child: const Text('Mark Ready for Pickup 📦'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _statCard(String icon, String label, String value, Color color) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Text(icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(height: 4),
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String icon, String title, String sub) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            Text(sub, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ])),
        ],
      ),
    );
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'CONFIRMED': return Colors.blue;
      case 'PREPARING': return Colors.orange;
      case 'READY_FOR_PICKUP': return Colors.purple;
      case 'DISPATCHED': return Colors.indigo;
      case 'DELIVERED': return Colors.green;
      case 'CANCELLED': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final tabs = ['Dashboard', 'Products', 'Orders', 'Wallet'];
    final body = _isLoading
      ? const Center(child: CircularProgressIndicator())
      : [_buildDashboardTab(), _buildProductsTab(), _buildOrdersTab(), _buildWalletTab()][_tabIdx];

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(tabs[_tabIdx]),
        backgroundColor: const Color(0xFF7F1D1D),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () => WhatsAppService.openWhatsApp(phone: '+2348000000000', message: 'Hello RushPoint Support'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ApiService.logout();
              if (!mounted) return;
                            Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
            },
          ),
        ],
      ),
      body: body,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _tabIdx,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: const Color(0xFF7F1D1D),
        unselectedItemColor: Colors.grey,
        onTap: (idx) => setState(() => _tabIdx = idx),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.inventory_2), label: 'Products'),
          BottomNavigationBarItem(icon: Icon(Icons.shopping_bag), label: 'Orders'),
          BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
        ],
      ),
    );
  }
}
