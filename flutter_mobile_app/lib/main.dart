import 'package:flutter/material.dart';
import 'screens/auth/login_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const RushPointApp());
}

class RushPointApp extends StatelessWidget {
  const RushPointApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
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
