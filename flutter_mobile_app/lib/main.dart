import 'package:flutter/material.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/security_lock_screen.dart';
import 'services/session_security_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const RushPointApp());
}

class RushPointApp extends StatefulWidget {
  const RushPointApp({super.key});

  @override
  State<RushPointApp> createState() => _RushPointAppState();
}

class _RushPointAppState extends State<RushPointApp> with WidgetsBindingObserver {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      SessionSecurityService.onAppPaused();
    } else if (state == AppLifecycleState.resumed) {
      if (SessionSecurityService.shouldLockOnResume() && !SessionSecurityService.isLocked) {
        SessionSecurityService.isLocked = true;
        _navigatorKey.currentState?.push(
          MaterialPageRoute(
            builder: (_) => SecurityLockScreen(
              onUnlocked: () {
                _navigatorKey.currentState?.pop();
              },
            ),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      title: 'RushPoint',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        primaryColor: const Color(0xFF7F1D1D),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF7F1D1D),
          primary: const Color(0xFF7F1D1D),
          secondary: const Color(0xFF0F172A),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF7F1D1D),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF7F1D1D),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ),
      ),
      home: const LoginScreen(),
    );
  }
}
