// ignore_for_file: unused_field, use_build_context_synchronously, prefer_const_constructors, prefer_const_literals_to_create_immutables
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../services/session_security_service.dart';
import 'login_screen.dart';

class SecurityLockScreen extends StatefulWidget {
  final VoidCallback onUnlocked;
  const SecurityLockScreen({super.key, required this.onUnlocked});

  @override
  State<SecurityLockScreen> createState() => _SecurityLockScreenState();
}

class _SecurityLockScreenState extends State<SecurityLockScreen> {
  String _enteredPin = "";
  bool _isAuthenticating = false;
  String? _errorMessage;

  void _onKeyPress(String val) {
    if (_enteredPin.length < 4) {
      setState(() {
        _enteredPin += val;
        _errorMessage = null;
      });
      if (_enteredPin.length == 4) {
        _verifyPin(_enteredPin);
      }
    }
  }

  void _onBackspace() {
    if (_enteredPin.isNotEmpty) {
      setState(() {
        _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1);
        _errorMessage = null;
      });
    }
  }

  Future<void> _verifyPin(String pin) async {
    setState(() => _isAuthenticating = true);
    final isValid = await SessionSecurityService.verifyQuickPin(pin);
    if (isValid) {
      SessionSecurityService.isLocked = false;
      widget.onUnlocked();
    } else {
      setState(() {
        _enteredPin = "";
        _isAuthenticating = false;
        _errorMessage = "Incorrect 4-Digit Security PIN. Try again.";
      });
    }
  }

  Future<void> _simulateBiometricAuth() async {
    setState(() => _isAuthenticating = true);
    // Instant Biometric / Thumbprint verification
    await Future.delayed(const Duration(milliseconds: 600));
    SessionSecurityService.isLocked = false;
    widget.onUnlocked();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF2B0008), Color(0xFF140003)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 30),
              // App Security Badge
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: Colors.white10,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white24, width: 2),
                ),
                child: const Center(child: Icon(Icons.lock_outline, color: Colors.white, size: 32)),
              ),
              const SizedBox(height: 16),
              const Text('RushPoint Security', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text('Session locked for your protection 🔒', style: TextStyle(color: Color(0xFFFECDD3), fontSize: 13)),
              const SizedBox(height: 24),

              // 4 PIN Dots (OPay Style)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(4, (index) {
                  final isFilled = index < _enteredPin.length;
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 10),
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isFilled ? const Color(0xFFE11D48) : Colors.transparent,
                      border: Border.all(color: isFilled ? const Color(0xFFE11D48) : Colors.white54, width: 2),
                    ),
                  );
                }),
              ),

              if (_errorMessage != null)
                Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Text(_errorMessage!, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12, fontWeight: FontWeight.bold)),
                ),

              const Spacer(),

              // Biometric Thumbprint Prompt
              InkWell(
                onTap: _simulateBiometricAuth,
                borderRadius: BorderRadius.circular(30),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(color: Colors.white24),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.fingerprint, color: Color(0xFF38BDF8), size: 28),
                      SizedBox(width: 8),
                      Text('Unlock with Thumbprint / Face ID', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // OPay-Style Numeric Keypad
              _buildKeypad(),

              const SizedBox(height: 16),

              // Switch to Password Sign In
              TextButton(
                onPressed: () async {
                  await ApiService.logout();
                  SessionSecurityService.isLocked = false;
                  Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
                },
                child: const Text('Switch to Password Login ➔', style: TextStyle(color: Colors.white70, fontSize: 13, decoration: TextDecoration.underline)),
              ),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildKeypad() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 36),
      child: Column(
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [_keyBtn('1'), _keyBtn('2'), _keyBtn('3')]),
          const SizedBox(height: 14),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [_keyBtn('4'), _keyBtn('5'), _keyBtn('6')]),
          const SizedBox(height: 14),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [_keyBtn('7'), _keyBtn('8'), _keyBtn('9')]),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _iconBtn(Icons.fingerprint, _simulateBiometricAuth, color: const Color(0xFF38BDF8)),
              _keyBtn('0'),
              _iconBtn(Icons.backspace_outlined, _onBackspace),
            ],
          ),
        ],
      ),
    );
  }

  Widget _keyBtn(String val) {
    return InkWell(
      onTap: () => _onKeyPress(val),
      borderRadius: BorderRadius.circular(40),
      child: Container(
        width: 68,
        height: 68,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white12),
        ),
        child: Center(
          child: Text(val, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600, color: Colors.white)),
        ),
      ),
    );
  }

  Widget _iconBtn(IconData icon, VoidCallback onTap, {Color color = Colors.white70}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(40),
      child: Container(
        width: 68,
        height: 68,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          shape: BoxShape.circle,
        ),
        child: Center(child: Icon(icon, color: color, size: 26)),
      ),
    );
  }
}
