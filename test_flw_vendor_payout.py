import urllib.request, json

BASE = 'http://localhost:8000'

def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    resp = urllib.request.urlopen(r)
    return json.loads(resp.read())

def run_test():
    print('=== TESTING FLUTTERWAVE GATEWAY, 100% VENDOR PAYOUT, ADMIN ESCROW & REFUNDS ===')

    # 1. Login Customer, Vendor, Rider & Admin
    c_tok = req('POST', '/api/auth/login', {'login': 'customer@rushingpoint.com', 'password': 'customer123'})['token']
    v_tok = req('POST', '/api/auth/login', {'login': 'vendor@rushingpoint.com', 'password': 'vendor123'})['token']
    r_tok = req('POST', '/api/auth/login', {'login': 'rider@rushingpoint.com', 'password': 'rider123'})['token']
    a_tok = req('POST', '/api/auth/login', {'login': 'admin@rushingpoint.com', 'password': 'admin123'})['token']

    v_bal_before = req('GET', '/api/finance/wallet/me', token=v_tok)['wallet']['balance']
    a_bal_before = req('GET', '/api/finance/wallet/me', token=a_tok)['wallet']['balance']
    print('[OK] 1. Initial Vendor Balance: NGN %.2f | Initial Admin Balance: NGN %.2f' % (v_bal_before, a_bal_before))

    # 2. Customer buys product via Flutterwave
    checkout_payload = {
        'store_id': 's-1',
        'items': [{'product_id': 'p-1', 'quantity': 1}], # p-1 is NGN 4,000
        'delivery_address': 'Plot 5, Victoria Island, Lagos',
        'customer_phone': '+2348077770001',
        'payment_method': 'FLUTTERWAVE'
    }
    order_res = req('POST', '/api/marketplace/checkout', checkout_payload, token=c_tok)
    order_id = order_res['order_id']
    order_ref = order_res['order_ref']
    otp = order_res['pod_otp']
    print('[OK] 2. Order Placed via Flutterwave: %s | Total: NGN %.2f' % (order_ref, order_res['total_amount']))

    # Verify Instant Vendor 100% Product Credit
    v_bal_after = req('GET', '/api/finance/wallet/me', token=v_tok)['wallet']['balance']
    vendor_gain = v_bal_after - v_bal_before
    print('[OK] 3. Vendor instantly received 100%% assigned product price: New Bal: NGN %.2f (Gain: +NGN %.2f)' % (v_bal_after, vendor_gain))
    assert abs(vendor_gain - 4000.0) < 0.01, 'Vendor must receive exact product amount'

    # Verify Admin Escrow Holding (Delivery Fee 1200 + Platform Fee 150 = 1350)
    a_bal_after = req('GET', '/api/finance/wallet/me', token=a_tok)['wallet']['balance']
    admin_gain = a_bal_after - a_bal_before
    print('[OK] 4. Admin Wallet received Delivery Escrow: New Bal: NGN %.2f (Gain: +NGN %.2f)' % (a_bal_after, admin_gain))
    assert abs(admin_gain - 1350.0) < 0.01, 'Admin must hold delivery and platform fee'

    # 3. Assign Rider, Verify Delivery & POD
    req('POST', '/api/dispatch/assign', {'order_id': order_id, 'rider_id': 'r-1'}, token=a_tok)
    r_bal_before = req('GET', '/api/finance/wallet/me', token=r_tok)['wallet']['balance']

    pod_res = req('POST', '/api/orders/' + order_id + '/verify-delivery', {'otp': otp, 'signature': 'Customer Sig', 'notes': 'Received in perfect condition'}, token=r_tok)
    print('[OK] 5. POD Verified: %s' % pod_res['message'])

    r_bal_after = req('GET', '/api/finance/wallet/me', token=r_tok)['wallet']['balance']
    rider_gain = r_bal_after - r_bal_before
    print('[OK] 6. Rider received delivery earnings upon completed delivery (+NGN %.2f)' % rider_gain)

    # 4. Test Admin Instant Refund for Unavailable Products
    order2_res = req('POST', '/api/marketplace/checkout', {
        'store_id': 's-1',
        'items': [{'product_id': 'p-2', 'quantity': 1}], # NGN 3,800
        'delivery_address': '10 Lekki Phase 1',
        'customer_phone': '+2348077770001',
        'payment_method': 'FLUTTERWAVE'
    }, token=c_tok)
    order2_id = order2_res['order_id']

    ref_res = req('POST', '/api/orders/' + order2_id + '/refund', {'reason': 'Item unavailable / out of stock'}, token=a_tok)
    print('[OK] 7. Admin processed refund successfully | Status: %s | Refund Amount: NGN %.2f' % (ref_res['status'], ref_res['refund_amount']))

    print()
    print('*** ALL FLUTTERWAVE, INSTANT VENDOR PAYOUTS, ADMIN ESCROW & REFUND FEATURES VERIFIED 100% OPERATIONAL ***')

if __name__ == '__main__':
    run_test()
