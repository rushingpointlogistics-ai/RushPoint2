// ignore_for_file: use_build_context_synchronously, deprecated_member_use, prefer_const_constructors, prefer_const_literals_to_create_immutables
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/whatsapp_service.dart';
import '../auth/login_screen.dart';

class RiderMissionScreen extends StatefulWidget {
  const RiderMissionScreen({super.key});

  @override
  State<RiderMissionScreen> createState() => _RiderMissionScreenState();
}

class _RiderMissionScreenState extends State<RiderMissionScreen> {
  int _tabIdx = 0;
  Map<String, dynamic> _wallet = {'balance': 0.0};
  Map<String, dynamic>? _activeMission;
  List<dynamic> _history = [];
  bool _isLoading = true;
  bool _isAvailable = true;

  @override
  void initState() {
    super.initState();
    _loadRiderData();
  }

  Future<void> _loadRiderData() async {
    setState(() => _isLoading = true);
    try {
      final wRes = await ApiService.get('/api/finance/wallet/me');
      final mRes = await ApiService.get('/api/riders/active-mission');
      final hRes = await ApiService.get('/api/riders/delivery-history');
      setState(() {
        _wallet = wRes['wallet'] ?? {'balance': 0.0};
        _activeMission = mRes['mission'];
        _history = hRes['deliveries'] ?? [];
      });
    } catch (_) {}
    setState(() => _isLoading = false);
  }

  Future<void> _updateMissionStatus(String orderId, String status) async {
    try {
      final res = await ApiService.post('/api/riders/update-mission/$orderId', {'status': status});
      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Status updated: $status ✅'), backgroundColor: Colors.green),
        );
        _loadRiderData();
      }
    } catch (_) {}
  }

  Future<void> _confirmDeliveryOtp(String orderId) async {
    final otpCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Enter Customer POD PIN'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Ask the customer for their 4-digit delivery PIN to confirm delivery and release escrow payment.'),
            const SizedBox(height: 16),
            TextField(
              controller: otpCtrl,
              keyboardType: TextInputType.number,
              maxLength: 4,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 10),
              decoration: const InputDecoration(hintText: '----', border: OutlineInputBorder(), counterText: ''),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              try {
                final res = await ApiService.post('/api/riders/confirm-delivery', {
                  'order_id': orderId,
                  'pod_otp': otpCtrl.text.trim(),
                });
                Navigator.pop(ctx);
                if (res['success'] == true) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Delivery confirmed! ₦${res['rider_earning'] ?? '---'} earned 💰'), backgroundColor: Colors.green),
                  );
                  _loadRiderData();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(res['detail'] ?? 'Invalid PIN. Try again.'), backgroundColor: Colors.red),
                  );
                }
              } catch (_) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Error confirming delivery.'), backgroundColor: Colors.red),
                );
              }
            },
            child: const Text('Confirm Delivery'),
          ),
        ],
      ),
    );
  }

  Future<void> _requestWithdrawal() async {
    final amtCtrl = TextEditingController();
    final pinCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Withdraw Rider Earnings 🏦'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Trip Balance: ₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
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
              const Text('Enter your 4-digit transaction PIN to authorize.', style: TextStyle(fontSize: 11, color: Colors.grey)),
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
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter valid amount.')));
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
                    SnackBar(content: Text(res['message'] ?? 'Withdrawal submitted! ✅'), backgroundColor: Colors.green),
                  );
                  _loadRiderData();
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

  Future<void> _toggleAvailability() async {
    try {
      final status = _isAvailable ? 'OFFLINE' : 'AVAILABLE';
      await ApiService.post('/api/riders/update-status', {'operational_status': status});
      setState(() => _isAvailable = !_isAvailable);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Status: ${_isAvailable ? "Available ✅" : "Offline 🔴"}'), backgroundColor: _isAvailable ? Colors.green : Colors.grey),
      );
    } catch (_) {}
  }

  Widget _buildMissionTab() {
    return RefreshIndicator(
      onRefresh: _loadRiderData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Availability Toggle
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: _isAvailable ? const Color(0xFFF0FDF4) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: _isAvailable ? Colors.green.shade300 : Colors.grey.shade300),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(children: [
                    Icon(_isAvailable ? Icons.circle : Icons.circle_outlined, color: _isAvailable ? Colors.green : Colors.grey, size: 14),
                    const SizedBox(width: 8),
                    Text(_isAvailable ? 'Available for Dispatch' : 'Currently Offline',
                      style: TextStyle(fontWeight: FontWeight.bold, color: _isAvailable ? Colors.green.shade800 : Colors.grey.shade700)),
                  ]),
                  Switch(value: _isAvailable, onChanged: (_) => _toggleAvailability(), activeColor: Colors.green),
                ],
              ),
            ),
            const SizedBox(height: 16),

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
                  const Text('Trip Earnings Balance', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Text('₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
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

            // Active Mission
            const Text('Active Mission', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 8),
            if (_activeMission == null)
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                child: const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: Column(children: [
                    Text('🏍️', style: TextStyle(fontSize: 40)),
                    SizedBox(height: 10),
                    Text('No active mission', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    Text('You will receive dispatch notifications when orders are assigned.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 13)),
                  ])),
                ),
              )
            else
              _buildActiveMissionCard(_activeMission!),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveMissionCard(Map<String, dynamic> m) {
    final status = m['status'] ?? 'ASSIGNED';
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(m['order_ref'] ?? 'RP-ORD', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(20)),
                  child: Text(status, style: TextStyle(color: Colors.blue.shade800, fontWeight: FontWeight.bold, fontSize: 11)),
                ),
              ],
            ),
            const Divider(height: 20),
            _missionRow(Icons.store, 'Pickup', m['store_name'] ?? 'Vendor Store'),
            const SizedBox(height: 8),
            _missionRow(Icons.location_on, 'Delivery', m['delivery_address'] ?? 'Customer Address'),
            const SizedBox(height: 8),
            _missionRow(Icons.attach_money, 'Your Earning', '₦${(m['rider_fee'] as num?)?.toStringAsFixed(2) ?? '---'}'),
            const SizedBox(height: 16),
            // Action buttons based on status
            if (status == 'ASSIGNED')
              Column(children: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.thumb_up),
                    label: const Text('Accept Mission & Go to Vendor'),
                    onPressed: () => _updateMissionStatus(m['order_id'] ?? '', 'DISPATCHED'),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.chat, color: Color(0xFF25D366)),
                    label: const Text('WhatsApp Customer', style: TextStyle(color: Color(0xFF25D366))),
                    onPressed: () => WhatsAppService.openWhatsApp(
                      phone: m['customer_phone'] ?? '+2340000000000',
                      message: 'Hello, I am your RushPoint rider (${m['order_ref'] ?? 'RP-ORD'}). I have accepted your order and am on the way to pick up from the store.',
                    ),
                  ),
                ),
              ]),
            if (status == 'DISPATCHED')
              Column(children: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.check_circle),
                    label: const Text('Confirm Delivery (POD PIN) 🔓'),
                    onPressed: () => _confirmDeliveryOtp(m['order_id'] ?? ''),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.chat, color: Color(0xFF25D366)),
                    label: const Text('WhatsApp Customer', style: TextStyle(color: Color(0xFF25D366))),
                    onPressed: () => WhatsAppService.openWhatsApp(
                      phone: m['customer_phone'] ?? '+2340000000000',
                      message: 'Hello, I am almost at your location with your RushPoint order (${m['order_ref'] ?? 'RP-ORD'}). Please have your 4-digit PIN ready.',
                    ),
                  ),
                ),
              ]),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryTab() {
    return RefreshIndicator(
      onRefresh: _loadRiderData,
      child: _history.isEmpty
        ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('📋', style: TextStyle(fontSize: 48)),
            SizedBox(height: 10),
            Text('No delivery history yet', style: TextStyle(color: Colors.grey)),
          ]))
        : ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _history.length,
            itemBuilder: (_, i) {
              final h = _history[i];
              return Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFFEF2F2),
                    child: Text('🏍️'),
                  ),
                  title: Text(h['order_ref'] ?? 'RP-ORD', style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text(h['delivery_address'] ?? 'Address'),
                  trailing: Text('₦${(h['rider_fee'] as num?)?.toStringAsFixed(0) ?? '---'}',
                    style: const TextStyle(color: Color(0xFF7F1D1D), fontWeight: FontWeight.bold, fontSize: 14)),
                ),
              );
            },
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
                const Text('Total Trip Earnings', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 4),
                Text('₦${(_wallet['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                  style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                const Text('80% of delivery fee per trip', style: TextStyle(color: Colors.white60, fontSize: 12)),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: const Color(0xFF7F1D1D)),
                    icon: const Icon(Icons.account_balance),
                    label: const Text('Withdraw to Bank Account'),
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
                  const Text('Earnings Breakdown', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                  const SizedBox(height: 12),
                  _infoRow('🏍️', '80% delivery share', 'You receive 80% of every delivery fee charged'),
                  _infoRow('🔓', 'POD PIN confirms payment', 'Funds release to your wallet on delivery confirmation'),
                  _infoRow('⏱️', 'Instant settlement', 'Earnings appear in wallet immediately after delivery'),
                  _infoRow('🏦', 'Bank withdrawal', 'Withdraw anytime, minimum ₦500'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _missionRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF7F1D1D)),
        const SizedBox(width: 8),
        Text('$label: ', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 13), overflow: TextOverflow.ellipsis)),
      ],
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

  @override
  Widget build(BuildContext context) {
    final tabs = ['Mission', 'History', 'Wallet'];
    final body = _isLoading
      ? const Center(child: CircularProgressIndicator())
      : [_buildMissionTab(), _buildHistoryTab(), _buildWalletTab()][_tabIdx];

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text('Rider: ${tabs[_tabIdx]}'),
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
          BottomNavigationBarItem(icon: Icon(Icons.local_shipping), label: 'Mission'),
          BottomNavigationBarItem(icon: Icon(Icons.history), label: 'History'),
          BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
        ],
      ),
    );
  }
}
