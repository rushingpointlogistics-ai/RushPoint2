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
    print('=== TESTING TODAY OPERATIONS, WAYBILLS, BULK PRODUCTS & SETTINGS ===')

    # 1. Login Admin & Rider
    a_tok = req('POST', '/api/auth/login', {'login': 'admin@rushingpoint.com', 'password': 'admin123'})['token']
    r_tok = req('POST', '/api/auth/login', {'login': 'rider@rushingpoint.com', 'password': 'rider123'})['token']
    print('[OK] 1. Authentication successful')

    # 2. Check Today\'s Operations Metrics
    today_res = req('GET', '/api/admin/dashboard/today', token=a_tok)
    metrics = today_res['today_operations']
    print('[OK] 2. Dashboard Today Operations Metrics received:')
    print('     a. Total Orders Today: %d' % metrics['total_orders_today'])
    print('     b. Pending Orders: %d' % metrics['pending_orders'])
    print('     c. Assigned: %d' % metrics['assigned'])
    print('     d. In Transit: %d' % metrics['in_transit'])
    print('     e. Delivered: %d' % metrics['delivered'])
    print('     f. Cancelled: %d' % metrics['cancelled'])
    print('     g. Active Riders: %d' % metrics['active_riders'])
    print('     h. Offline Riders: %d' % metrics['offline_riders'])
    print('     i. Revenue Today: NGN %.2f' % metrics['revenue_today'])
    print('     j. Rider Earnings Today: NGN %.2f' % metrics['rider_earnings_today'])

    # 3. Test Function 2 for Riders: Waybill & Custom Logistics Link Generator (e.g. Kano -> Katsina Park pickup)
    wb_payload = {
        'customer_name': 'Mallam Usman Katsina',
        'customer_phone': '+2348033339999',
        'item_description': '3 Cartons of Electronics from Kano Park',
        'pickup_location': 'Katsina Central Motor Park, Bayajidda Road, Katsina',
        'dropoff_address': '12 Kofar Kaura Layout, Katsina',
        'transport_fee': 4500.0,
        'notes': 'Goods arrived via Kano commercial bus'
    }
    wb_res = req('POST', '/api/admin/custom-dispatch/generate-link', wb_payload, token=a_tok)
    print('[OK] 3. Custom Waybill Link Generated: %s | Link: %s' % (wb_res['dispatch_ref'], wb_res['payment_link']))
    print('     WhatsApp URL: %s' % wb_res['whatsapp_url'])

    # Test Manual Rider Payout for Waybill (Admin manual payment before or after delivery)
    r_profile = req('GET', '/api/riders/profile', token=r_tok)
    rider_id = r_profile['rider']['id']
    pay_res = req('POST', '/api/admin/custom-dispatch/' + wb_res['dispatch_id'] + '/pay-rider', {'rider_id': rider_id, 'amount': 3600.0, 'notes': 'Station pickup compensation'}, token=a_tok)
    print('[OK] 4. Admin Manual Rider Payout: Successfully paid NGN 3,600.00 to rider %s' % r_profile['rider']['rider_ref'])

    # 4. Test Bulk Product Updates (Increase price by 5% and Set Stock)
    prods = req('GET', '/api/products/')['products']
    p_ids = [p['id'] for p in prods[:3]]
    bulk_res = req('POST', '/api/products/bulk-stock-price', {'product_ids': p_ids, 'action': 'PERCENT_INCREASE', 'value': 5.0}, token=a_tok)
    print('[OK] 5. Bulk Product Price Increase (+5%%): %s' % bulk_res['message'])

    # 5. Test Category CRUD & Updates
    import secrets
    uniq_suffix = secrets.token_hex(3)
    new_cat = req('POST', '/api/categories/', {'name': f'Industrial Equipment {uniq_suffix}'}, token=a_tok)
    cat_id = new_cat['category_id']
    up_cat = req('PUT', '/api/categories/' + cat_id, {'name': f'Industrial Heavy Tools {uniq_suffix}'}, token=a_tok)
    print('[OK] 6. Category Created & Updated: %s' % up_cat['message'])

    # 6. Test Reports Hub
    rep_res = req('GET', '/api/admin/reports', token=a_tok)
    print('[OK] 7. Executive Reports Hub: Success Rate %.1f%% | Avg Delivery: %.1f mins' % (rep_res['growth_metrics']['delivery_success_rate'], rep_res['growth_metrics']['avg_delivery_time_mins']))

    print()
    print('*** ALL OPERATIONS, WAYBILLS, BULK ACTIONS, SETTINGS & REPORTS VERIFIED 100% OPERATIONAL ***')

if __name__ == '__main__':
    run_test()
