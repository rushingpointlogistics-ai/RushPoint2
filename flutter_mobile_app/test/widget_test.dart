import 'package:flutter_test/flutter_test.dart';
import 'package:rushpoint_mobile/main.dart';

void main() {
  testWidgets('RushPoint app loads login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const RushPointApp());
    expect(find.text('RushPoint'), findsWidgets);
  });
}
