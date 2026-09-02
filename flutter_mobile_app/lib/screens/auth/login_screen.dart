import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../customer/customer_home_screen.dart';
import '../vendor/vendor_dashboard_screen.dart';
import '../rider/rider_mission_screen.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _loginController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _handleLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final res = await ApiService.post('/api/auth/login', {
        'login': _loginController.text.trim(),
        'password': _passwordController.text,
      });

      if (res['success'] == true && res['token'] != null) {
        await ApiService.setToken(res['token']);
        final user = res['user'];
        final accountType = user['account_type'];

        if (!mounted) return;

        if (accountType == 'CUSTOMER') {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const CustomerHomeScreen()));
        } else if (accountType == 'VENDOR') {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const VendorDashboardScreen()));
        } else if (accountType == 'RIDER') {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const RiderMissionScreen()));
        } else {
          setState(() {
            _errorMessage = "System Administrators must use the Web Desktop Portal at /admin";
          });
        }
      } else {
        setState(() {
          _errorMessage = res['detail'] ?? "Invalid login credentials.";
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = "Connection error. Please check internet connection.";
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF2B0008), Color(0xFF1F0005)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo Title
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 15, offset: const Offset(0, 5)),
                      ],
                    ),
                    child: const Center(
                      child: Text('RP', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Color(0xFF7F1D1D))),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('RushPoint', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -0.5)),
                  const Text('Every Delivery, On Point.', style: TextStyle(fontSize: 14, color: Color(0xFFFECDD3))),
                  const SizedBox(height: 32),

                  // Login Card
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    elevation: 8,
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text('Sign In', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF7F1D1D))),
                          const SizedBox(height: 6),
                          const Text('Customer, Vendor, or Rider account', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          const SizedBox(height: 16),

                          if (_errorMessage != null)
                            Container(
                              padding: const EdgeInsets.all(10),
                              margin: const EdgeInsets.only(bottom: 12),
                              decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.red.shade200)),
                              child: Text(_errorMessage!, style: const TextStyle(color: Color(0xFF991B1B), fontSize: 12, fontWeight: FontWeight.w600)),
                            ),

                          TextField(
                            controller: _loginController,
                            decoration: InputDecoration(
                              labelText: 'Email or Phone Number',
                              prefixIcon: const Icon(Icons.person_outline),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock_outline),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                          ),
                          const SizedBox(height: 20),
                          ElevatedButton(
                            onPressed: _isLoading ? null : _handleLogin,
                            child: _isLoading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Text('Sign In 🚀'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Signup link for customers
                  TextButton(
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SignupScreen()));
                    },
                    child: const Text("New here? Create a Customer Account ✨", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
