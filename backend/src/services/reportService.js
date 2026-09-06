/**
 * reportService.js
 *
 * All database logic for report queries.
 * Aggregates data from payment_transactions, product_charges, bookings, etc.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');

class ReportService {
  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 1: Financial Ledger
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get ledger entries (payment_transactions) with optional filters.
   * Returns transactions with customer info joined via bookings → users.
   * @param {Object} filters - { method, type, start_date, end_date, booking_id }
   * @returns {Promise<Array>} - Ledger rows
   */
  async getLedger({ method, type, start_date, end_date, booking_id, page = 1, limit = 50 } = {}) {
    // When filtering by booking_id, only show payment_transactions (expenses are not booking-specific)
    if (booking_id) {
      let query = `
        SELECT 
          pt.id,
          pt.booking_id,
          pt.type,
          pt.amount,
          pt.method,
          pt.charge_breakdown,
          pt.notes,
          pt.recorded_by,
          pt.transaction_date,
          pt.transaction_type,
          u.name as customer_name,
          u.phone as customer_phone
        FROM payment_transactions pt
        LEFT JOIN bookings b ON pt.booking_id = b.id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (method) {
        params.push(method);
        query += ` AND pt.method = $${params.length}`;
      }
      if (type) {
        if (type === 'credit') query += ` AND pt.type = 'payment'`;
        else if (type === 'debit') query += ` AND pt.type = 'refund'`;
        else if (type === 'adjustment') query += ` AND pt.type = 'adjustment'`;
      }
      if (start_date) { params.push(start_date); query += ` AND pt.transaction_date >= $${params.length}::date`; }
      if (end_date) { params.push(end_date); query += ` AND pt.transaction_date < ($${params.length}::date + interval '1 day')`; }

      params.push(booking_id);
      query += ` AND pt.booking_id = $${params.length}`;

      query += ' ORDER BY pt.transaction_date DESC';
      const offset = (page - 1) * limit;
      params.push(limit); query += ` LIMIT $${params.length}`;
      params.push(offset); query += ` OFFSET $${params.length}`;

      const result = await pool.query(query, params);
      return result.rows;
    }

    // Build UNION of payment_transactions + approved Shop Cash expenses
    // Skip expense rows when filtering by type = credit or adjustment (expenses are always debits)
    if (type === 'credit' || type === 'adjustment') {
      // Only show payment_transactions for credit/adjustment filters
      let query = `
        SELECT 
          pt.id,
          pt.booking_id,
          pt.type,
          pt.amount,
          pt.method,
          pt.charge_breakdown,
          pt.notes,
          pt.recorded_by,
          pt.transaction_date,
          pt.transaction_type,
          u.name as customer_name,
          u.phone as customer_phone
        FROM payment_transactions pt
        LEFT JOIN bookings b ON pt.booking_id = b.id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE 1=1
      `;
      const params = [];
      if (method) { params.push(method); query += ` AND pt.method = $${params.length}`; }
      if (type === 'credit') query += ` AND pt.type = 'payment'`;
      else if (type === 'adjustment') query += ` AND pt.type = 'adjustment'`;
      if (start_date) { params.push(start_date); query += ` AND pt.transaction_date >= $${params.length}::date`; }
      if (end_date) { params.push(end_date); query += ` AND pt.transaction_date < ($${params.length}::date + interval '1 day')`; }
      query += ' ORDER BY pt.transaction_date DESC';
      const offset = (page - 1) * limit;
      params.push(limit); query += ` LIMIT $${params.length}`;
      params.push(offset); query += ` OFFSET $${params.length}`;
      const result = await pool.query(query, params);
      return result.rows;
    }

    // UNION query: payment_transactions + approved Shop Cash expenses + approved cash adjustments
    let ptWhere = '1=1';
    let expWhere = "e.approval_status = 'approved' AND e.payment_source = 'Shop Cash'";
    let adjWhere = "ca.approval_status = 'approved'";
    const params = [];

    if (method) {
      params.push(method);
      ptWhere += ` AND pt.method = $${params.length}`;
      // For expenses in the UNION, method is always 'Shop Cash'
      // If filtering for a method other than 'Shop Cash', exclude expense rows
      if (method !== 'Shop Cash') {
        expWhere += ' AND FALSE';
      }
      // Cash adjustments are always cash-level, exclude when filtering by non-Cash method
      if (method !== 'Cash') {
        adjWhere += ' AND FALSE';
      }
    }

    if (type === 'debit') {
      ptWhere += ` AND pt.type = 'refund'`;
      // expenses are always debits, so include them
      // adjustments can be positive or negative — only include negative (shortage) for debit filter
      adjWhere += ' AND ca.amount < 0';
    } else if (!type || type === '') {
      // no type filter — include all
    }

    if (start_date) {
      params.push(start_date);
      ptWhere += ` AND pt.transaction_date >= $${params.length}::date`;
      expWhere += ` AND e.expense_date >= $${params.length}::date`;
      adjWhere += ` AND ca.adjustment_date >= $${params.length}::date`;
    }

    if (end_date) {
      params.push(end_date);
      ptWhere += ` AND pt.transaction_date < ($${params.length}::date + interval '1 day')`;
      expWhere += ` AND e.expense_date < ($${params.length}::date + interval '1 day')`;
      adjWhere += ` AND ca.adjustment_date < ($${params.length}::date + interval '1 day')`;
    }

    const query = `
      SELECT * FROM (
        SELECT 
          pt.id,
          pt.booking_id,
          pt.type,
          pt.amount,
          pt.method,
          pt.charge_breakdown,
          pt.notes,
          pt.recorded_by,
          pt.transaction_date,
          pt.transaction_type,
          u.name as customer_name,
          u.phone as customer_phone
        FROM payment_transactions pt
        LEFT JOIN bookings b ON pt.booking_id = b.id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE ${ptWhere}

        UNION ALL

        SELECT
          e.id * -1 as id,
          NULL::int as booking_id,
          'expense' as type,
          e.amount,
          'Shop Cash' as method,
          NULL::jsonb as charge_breakdown,
          e.category || COALESCE(': ' || e.description, '') as notes,
          e.recorded_by,
          e.expense_date as transaction_date,
          'expense' as transaction_type,
          NULL as customer_name,
          NULL as customer_phone
        FROM expenses e
        WHERE ${expWhere}

        UNION ALL

        SELECT
          ca.id * -2 as id,
          NULL::int as booking_id,
          'adjustment' as type,
          ca.amount,
          'Cash' as method,
          NULL::jsonb as charge_breakdown,
          ca.reason as notes,
          ca.recorded_by,
          ca.adjustment_date as transaction_date,
          'adjustment' as transaction_type,
          NULL as customer_name,
          NULL as customer_phone
        FROM cash_adjustments ca
        WHERE ${adjWhere}
      ) combined
      ORDER BY transaction_date DESC
    `;

    // Pagination
    const offset = (page - 1) * limit;
    params.push(limit);
    const fullQuery = query + ` LIMIT $${params.length}`;
    params.push(offset);
    const finalQuery = fullQuery + ` OFFSET $${params.length}`;

    const result = await pool.query(finalQuery, params);
    return result.rows;
  }

  /**
   * Get ledger summary (total credits, debits, expenses, adjustments, net) for filtered period.
   * Only approved 'Shop Cash' expenses are included in the ledger totals.
   * Approved cash adjustments (+surplus / -shortage) also affect the net balance.
   * @param {Object} filters - { method, start_date, end_date }
   * @returns {Promise<Object>} - { total_credits, total_debits, total_expenses, total_adjustments, net_balance, method_breakdown }
   */
  async getLedgerSummary({ method, start_date, end_date } = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (method) {
      params.push(method);
      whereClause += ` AND pt.method = $${params.length}`;
    }

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND pt.transaction_date >= $${params.length}::date`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND pt.transaction_date < ($${params.length}::date + interval '1 day')`;
    }

    // Totals from payment_transactions
    const totalsQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN pt.type = 'payment' THEN pt.amount ELSE 0 END), 0)::int as total_credits,
        COALESCE(SUM(CASE WHEN pt.type = 'refund' THEN pt.amount ELSE 0 END), 0)::int as total_debits
      FROM payment_transactions pt
      ${whereClause}
    `;
    const totalsResult = await pool.query(totalsQuery, params);

    // Shop Cash expense total (only if not filtering by a non-cash method)
    let totalExpenses = 0;
    if (!method || method === 'Shop Cash') {
      let expWhere = "WHERE approval_status = 'approved' AND payment_source = 'Shop Cash'";
      const expParams = [];
      if (start_date) { expParams.push(start_date); expWhere += ` AND expense_date >= $${expParams.length}::date`; }
      if (end_date) { expParams.push(end_date); expWhere += ` AND expense_date < ($${expParams.length}::date + interval '1 day')`; }

      const expResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::int as total FROM expenses ${expWhere}`,
        expParams
      );
      totalExpenses = expResult.rows[0].total;
    }

    // Cash adjustments total (only if not filtering by a non-Cash method)
    let totalAdjustments = 0;
    if (!method || method === 'Cash') {
      let adjWhere = "WHERE approval_status = 'approved'";
      const adjParams = [];
      if (start_date) { adjParams.push(start_date); adjWhere += ` AND adjustment_date >= $${adjParams.length}::date`; }
      if (end_date) { adjParams.push(end_date); adjWhere += ` AND adjustment_date < ($${adjParams.length}::date + interval '1 day')`; }

      const adjResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::int as total FROM cash_adjustments ${adjWhere}`,
        adjParams
      );
      totalAdjustments = adjResult.rows[0].total;
    }

    const { total_credits, total_debits } = totalsResult.rows[0];
    // Adjustments can be positive (surplus) or negative (shortage)
    const net_balance = total_credits - total_debits - totalExpenses + totalAdjustments;

    // Method breakdown
    const breakdownQuery = `
      SELECT 
        pt.method,
        COALESCE(SUM(CASE WHEN pt.type = 'payment' THEN pt.amount ELSE 0 END), 0)::int as credits,
        COALESCE(SUM(CASE WHEN pt.type = 'refund' THEN pt.amount ELSE 0 END), 0)::int as debits
      FROM payment_transactions pt
      ${whereClause}
      GROUP BY pt.method
      ORDER BY credits DESC
    `;

    const breakdownResult = await pool.query(breakdownQuery, params);

    return {
      total_credits,
      total_debits,
      total_expenses: totalExpenses,
      total_adjustments: totalAdjustments,
      net_balance,
      method_breakdown: breakdownResult.rows
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 2: Rental Collection Report
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get rental collection summary for a date range.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Object>} - { rent_due, rent_collected, outstanding, collection_pct }
   */
  async getRentalCollectionSummary({ start_date, end_date } = {}) {
    let whereClause = `WHERE pc.charge_type = 'rent'
      AND bp.status NOT IN ('exchanged', 'cancelled', 'discarded')`;
    const params = [];

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND bp.booked_from >= $${params.length}::date`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND bp.booked_from <= $${params.length}::date`;
    }

    const query = `
      SELECT 
        COALESCE(SUM(pc.due_amount), 0)::int as rent_due,
        COALESCE(SUM(pc.paid_amount), 0)::int as rent_collected,
        COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::int as outstanding
      FROM product_charges pc
      JOIN booking_products bp ON pc.booking_product_id = bp.id
      ${whereClause}
    `;

    const result = await pool.query(query, params);
    const row = result.rows[0];
    row.collection_pct = row.rent_due > 0
      ? Math.round((row.rent_collected / row.rent_due) * 1000) / 10
      : 0;

    return row;
  }

  /**
   * Get monthly rental collection breakdown for a financial year.
   * FY starts in April.
   * @param {number} fy_start_year - e.g. 2025 for FY 2025-26
   * @returns {Promise<Array>} - Monthly breakdown rows
   */
  async getRentalCollectionMonthly(fy_start_year) {
    const fyStart = `${fy_start_year}-04-01`;
    const fyEnd = `${fy_start_year + 1}-03-31`;

    const query = `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', bp.booked_from), 'Mon YYYY') as month_label,
        EXTRACT(MONTH FROM DATE_TRUNC('month', bp.booked_from))::int as month_num,
        EXTRACT(YEAR FROM DATE_TRUNC('month', bp.booked_from))::int as year,
        COALESCE(SUM(pc.due_amount), 0)::int as rent_due,
        COALESCE(SUM(pc.paid_amount), 0)::int as rent_collected,
        COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::int as outstanding
      FROM product_charges pc
      JOIN booking_products bp ON pc.booking_product_id = bp.id
      WHERE pc.charge_type = 'rent'
        AND bp.status NOT IN ('exchanged', 'cancelled', 'discarded')
        AND bp.booked_from >= $1::date
        AND bp.booked_from <= $2::date
      GROUP BY DATE_TRUNC('month', bp.booked_from)
      ORDER BY DATE_TRUNC('month', bp.booked_from)
    `;

    const result = await pool.query(query, [fyStart, fyEnd]);

    return result.rows.map(row => ({
      ...row,
      collection_pct: row.rent_due > 0
        ? Math.round((row.rent_collected / row.rent_due) * 1000) / 10
        : 0
    }));
  }

  /**
   * Get booking-level rent details for a specific month.
   * @param {number} year
   * @param {number} month - 1-12
   * @returns {Promise<Array>} - Booking-level rent rows
   */
  async getRentalCollectionByBooking(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

    const query = `
      SELECT 
        b.id as booking_id,
        u.name as customer_name,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'name', p.name,
            'code', p.code
          )) FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) as products,
        COALESCE(SUM(pc.due_amount), 0)::int as rent_due,
        COALESCE(SUM(pc.paid_amount), 0)::int as rent_paid,
        CASE 
          WHEN SUM(pc.due_amount) = SUM(pc.paid_amount) THEN 'Fully Paid'
          WHEN SUM(pc.paid_amount) > 0 THEN 'Partial'
          ELSE 'Unpaid'
        END as payment_status
      FROM product_charges pc
      JOIN booking_products bp ON pc.booking_product_id = bp.id
      JOIN bookings b ON bp.booking_id = b.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN products p ON bp.product_id = p.id
      WHERE pc.charge_type = 'rent'
        AND bp.status NOT IN ('exchanged', 'cancelled', 'discarded')
        AND bp.booked_from >= $1::date
        AND bp.booked_from <= $2::date
      GROUP BY b.id, u.name
      ORDER BY b.id
    `;

    const result = await pool.query(query, [startDate, endDate]);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 5: Charges & Penalties Report
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get all additional charges (penalties/fees) with optional filters.
   * @param {Object} filters - { charge_type, start_date, end_date }
   * @returns {Promise<Array>} - Charge rows with booking and product info
   */
  async getChargesReport({ charge_type, start_date, end_date } = {}) {
    const penaltyTypes = [
      'exchange_penalty', 'downgrade_penalty', 'cancellation_penalty',
      'late_fee', 'damage_fee'
    ];

    let whereClause = `WHERE pc.charge_type = ANY($1::text[])`;
    const params = [charge_type ? [charge_type] : penaltyTypes];

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND pc.created_at >= $${params.length}::date`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND pc.created_at < ($${params.length}::date + interval '1 day')`;
    }

    const query = `
      SELECT 
        pc.id,
        pc.charge_type,
        pc.due_amount as amount,
        pc.notes,
        pc.policy_reference,
        pc.created_at as date,
        b.id as booking_id,
        u.name as customer_name,
        p.name as product_name,
        p.code as product_code
      FROM product_charges pc
      JOIN booking_products bp ON pc.booking_product_id = bp.id
      JOIN bookings b ON bp.booking_id = b.id
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN products p ON bp.product_id = p.id
      ${whereClause}
      ORDER BY pc.created_at DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get charges summary per type for a date range.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Array>} - { charge_type, total_amount, count }
   */
  async getChargesSummary({ start_date, end_date } = {}) {
    const penaltyTypes = [
      'exchange_penalty', 'downgrade_penalty', 'cancellation_penalty',
      'late_fee', 'damage_fee'
    ];

    let whereClause = `WHERE pc.charge_type = ANY($1::text[])`;
    const params = [penaltyTypes];

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND pc.created_at >= $${params.length}::date`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND pc.created_at < ($${params.length}::date + interval '1 day')`;
    }

    const query = `
      SELECT 
        pc.charge_type,
        COALESCE(SUM(pc.due_amount), 0)::int as total_amount,
        COUNT(*)::int as count
      FROM product_charges pc
      ${whereClause}
      GROUP BY pc.charge_type
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 7: Dead Inventory / Slow-Moving Products
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get dead inventory report — products not booked recently.
   * @param {Object} filters - { min_idle_days, never_booked_only }
   * @returns {Promise<Array>} - Product rows with idle days
   */
  async getDeadInventory({ min_idle_days = 30, never_booked_only = false } = {}) {
    const query = `
      SELECT 
        p.id,
        p.code as product_code,
        p.name as product_name,
        pc_cat.name as category,
        p.rent as rent_per_day,
        MAX(bp.booked_to) as last_booked_date,
        CASE 
          WHEN MAX(bp.booked_to) IS NULL THEN 
            EXTRACT(DAY FROM NOW() - p.created_at)::int
          ELSE 
            EXTRACT(DAY FROM NOW() - MAX(bp.booked_to))::int
        END as days_idle,
        CASE WHEN MAX(bp.id) IS NULL THEN true ELSE false END as never_booked
      FROM products p
      LEFT JOIN product_categories pc_cat ON p.category_id = pc_cat.id
      LEFT JOIN booking_products bp ON bp.product_id = p.id 
        AND bp.status NOT IN ('cancelled', 'exchanged', 'discarded')
      WHERE p.status = 'available'
      GROUP BY p.id, p.code, p.name, pc_cat.name, p.rent, p.created_at
      HAVING 
        CASE 
          WHEN MAX(bp.booked_to) IS NULL THEN 
            EXTRACT(DAY FROM NOW() - p.created_at)::int
          ELSE 
            EXTRACT(DAY FROM NOW() - MAX(bp.booked_to))::int
        END >= $1
        ${never_booked_only ? 'AND MAX(bp.id) IS NULL' : ''}
      ORDER BY days_idle DESC
    `;

    const result = await pool.query(query, [min_idle_days]);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 10: Security Deposit Summary
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get security deposit summary grouped by payment method.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Array>} - { method, collected, refunded, held }
   */
  async getSecurityDepositSummary({ start_date, end_date } = {}) {
    let dateFilter = '';
    const params = [];

    if (start_date) {
      params.push(start_date);
      dateFilter += ` AND pt.transaction_date >= $${params.length}::date`;
    }

    if (end_date) {
      params.push(end_date);
      dateFilter += ` AND pt.transaction_date < ($${params.length}::date + interval '1 day')`;
    }

    const query = `
      SELECT 
        pt.method,
        COALESCE(SUM(CASE WHEN pt.type = 'payment' THEN (pt.charge_breakdown->>'security')::int ELSE 0 END), 0)::int as collected,
        COALESCE(SUM(CASE WHEN pt.type = 'refund' THEN (pt.charge_breakdown->>'security_refund')::int ELSE 0 END), 0)::int as refunded,
        COALESCE(
          SUM(CASE WHEN pt.type = 'payment' THEN (pt.charge_breakdown->>'security')::int ELSE 0 END) - 
          SUM(CASE WHEN pt.type = 'refund' THEN (pt.charge_breakdown->>'security_refund')::int ELSE 0 END), 0
        )::int as held
      FROM payment_transactions pt
      WHERE (jsonb_exists(pt.charge_breakdown, 'security') OR jsonb_exists(pt.charge_breakdown, 'security_refund'))
        ${dateFilter}
      GROUP BY pt.method
      ORDER BY collected DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 11: Customer Report
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get top customers by booking count and revenue.
   * @param {Object} filters - { limit }
   * @returns {Promise<Array>} - Customer rows
   */
  async getCustomerReport({ limit = 50 } = {}) {
    const query = `
      SELECT 
        u.id as user_id,
        u.name as customer_name,
        u.phone as customer_phone,
        COUNT(DISTINCT b.id)::int as booking_count,
        COALESCE(SUM(
          CASE WHEN pt.type = 'payment' THEN pt.amount ELSE 0 END
        ), 0)::int as total_revenue,
        COALESCE(SUM(
          CASE WHEN pt.type = 'payment' THEN pt.amount ELSE 0 END
        ) - SUM(
          CASE WHEN pt.type = 'refund' THEN pt.amount ELSE 0 END
        ), 0)::int as net_revenue
      FROM users u
      JOIN bookings b ON b.user_id = u.id
      LEFT JOIN payment_transactions pt ON pt.booking_id = b.id
      WHERE u.role = 'customer'
      GROUP BY u.id, u.name, u.phone
      ORDER BY total_revenue DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get customers with outstanding dues.
   * @returns {Promise<Array>} - Customer rows with outstanding amounts
   */
  async getCustomerOutstanding() {
    const query = `
      SELECT 
        u.id as user_id,
        u.name as customer_name,
        u.phone as customer_phone,
        COUNT(DISTINCT b.id)::int as active_bookings,
        COALESCE(SUM(pc.due_amount - pc.paid_amount), 0)::int as total_outstanding
      FROM users u
      JOIN bookings b ON b.user_id = u.id
      JOIN booking_products bp ON bp.booking_id = b.id
      JOIN product_charges pc ON pc.booking_product_id = bp.id
      WHERE u.role = 'customer'
        AND b.status NOT IN ('completed', 'cancelled')
        AND bp.status NOT IN ('exchanged', 'cancelled', 'discarded')
        AND pc.due_amount > pc.paid_amount
      GROUP BY u.id, u.name, u.phone
      HAVING SUM(pc.due_amount - pc.paid_amount) > 0
      ORDER BY total_outstanding DESC
    `;

    const result = await pool.query(query);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 12: Salesman Performance Report
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get salesman performance metrics.
   * @returns {Promise<Array>} - Salesman rows with metrics
   */
  async getSalesmanPerformance({ salesman_name } = {}) {
    const params = [];
    let salesmanFilter = '';
    if (salesman_name) {
      params.push(salesman_name);
      salesmanFilter = ` AND b.created_by = $${params.length}`;
    }

    const query = `
      SELECT 
        b.created_by as salesman,
        COUNT(DISTINCT b.id)::int as bookings_created,
        COALESCE(SUM(
          CASE WHEN pt.type = 'payment' THEN pt.amount ELSE 0 END
        ), 0)::int as revenue_generated,
        COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.id END)::int as cancellations
      FROM bookings b
      LEFT JOIN payment_transactions pt ON pt.booking_id = b.id
      WHERE b.created_by IS NOT NULL AND b.created_by != ''${salesmanFilter}
      GROUP BY b.created_by
      ORDER BY revenue_generated DESC
    `;

    const result = await pool.query(query, params);

    // Also get payments collected (recorded_by)
    const collectionParams = [];
    let collectionFilter = '';
    if (salesman_name) {
      collectionParams.push(salesman_name);
      collectionFilter = ` AND pt.recorded_by = $${collectionParams.length}`;
    }

    const collectionsQuery = `
      SELECT 
        pt.recorded_by as salesman,
        COALESCE(SUM(CASE WHEN pt.type = 'payment' THEN pt.amount ELSE 0 END), 0)::int as payments_collected
      FROM payment_transactions pt
      WHERE pt.recorded_by IS NOT NULL AND pt.recorded_by != ''${collectionFilter}
      GROUP BY pt.recorded_by
    `;

    const collectionsResult = await pool.query(collectionsQuery, collectionParams);
    const collectionsMap = {};
    for (const row of collectionsResult.rows) {
      collectionsMap[row.salesman] = row.payments_collected;
    }

    return result.rows.map(row => ({
      ...row,
      payments_collected: collectionsMap[row.salesman] || 0
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 13: Product Performance Report
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get product performance metrics.
   * @param {Object} filters - { limit }
   * @returns {Promise<Array>} - Product rows with performance data
   */
  async getProductPerformance({ limit = 50 } = {}) {
    const query = `
      SELECT 
        p.id,
        p.code as product_code,
        p.name as product_name,
        pc_cat.name as category,
        p.rent as rent_per_day,
        p.purchase_price,
        COUNT(DISTINCT bp.id) FILTER (WHERE bp.status NOT IN ('exchanged', 'cancelled', 'discarded'))::int as times_rented,
        COALESCE(SUM(pc.paid_amount) FILTER (WHERE pc.charge_type = 'rent'), 0)::int as total_rent_collected,
        CASE 
          WHEN p.purchase_price > 0 THEN 
            ROUND((COALESCE(SUM(pc.paid_amount) FILTER (WHERE pc.charge_type = 'rent'), 0)::numeric / p.purchase_price) * 100, 1)
          ELSE NULL
        END as roi_pct
      FROM products p
      LEFT JOIN product_categories pc_cat ON p.category_id = pc_cat.id
      LEFT JOIN booking_products bp ON bp.product_id = p.id
      LEFT JOIN product_charges pc ON pc.booking_product_id = bp.id
      WHERE p.status = 'available'
      GROUP BY p.id, p.code, p.name, pc_cat.name, p.rent, p.purchase_price
      ORDER BY total_rent_collected DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULE 9: Profit & Loss Dashboard
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get P&L summary for a date range.
   * Revenue = rent payments + penalty charges + late fees
   * Expenses = expenses table
   * Purchases = purchases table (inventory cost)
   * Profit = Revenue - Expenses - Purchases
   * @param {Object} filters - { start_date, end_date }
   */
  async getProfitAndLoss({ start_date, end_date } = {}) {
    const dateFilter = (alias, dateCol) => {
      const conditions = [];
      const params = [];
      if (start_date) { params.push(start_date); conditions.push(`${alias}.${dateCol} >= $${params.length}`); }
      if (end_date) { params.push(end_date); conditions.push(`${alias}.${dateCol} <= $${params.length}`); }
      return { conditions, params };
    };

    // Revenue: payments received (type='payment')
    const revFilter = dateFilter('pt', 'transaction_date');
    let revQuery = `SELECT COALESCE(SUM(pt.amount), 0)::int as total FROM payment_transactions pt WHERE pt.type = 'payment'`;
    if (revFilter.conditions.length) revQuery += ' AND ' + revFilter.conditions.join(' AND ');
    const revResult = await pool.query(revQuery, revFilter.params);

    // Refunds: money returned (type='refund')
    const refFilter = dateFilter('pt', 'transaction_date');
    let refQuery = `SELECT COALESCE(SUM(pt.amount), 0)::int as total FROM payment_transactions pt WHERE pt.type = 'refund'`;
    if (refFilter.conditions.length) refQuery += ' AND ' + refFilter.conditions.join(' AND ');
    const refResult = await pool.query(refQuery, refFilter.params);

    // Expenses
    const expFilter = dateFilter('e', 'expense_date');
    let expQuery = `SELECT COALESCE(SUM(e.amount), 0)::int as total FROM expenses e WHERE e.approval_status = 'approved'`;
    if (expFilter.conditions.length) expQuery += ' AND ' + expFilter.conditions.join(' AND ');
    const expResult = await pool.query(expQuery, expFilter.params);

    // Purchases (inventory cost)
    const purFilter = dateFilter('p', 'purchase_date');
    let purQuery = `SELECT COALESCE(SUM(p.amount), 0)::int as total FROM purchases p`;
    if (purFilter.conditions.length) purQuery += ' WHERE ' + purFilter.conditions.join(' AND ');
    const purResult = await pool.query(purQuery, purFilter.params);

    const revenue = revResult.rows[0].total;
    const refunds = refResult.rows[0].total;
    const expenses = expResult.rows[0].total;
    const purchases = purResult.rows[0].total;
    const netRevenue = revenue - refunds;
    const profit = netRevenue - expenses - purchases;

    return {
      revenue,
      refunds,
      net_revenue: netRevenue,
      expenses,
      purchases,
      profit,
      profit_margin: netRevenue > 0 ? Math.round((profit / netRevenue) * 100) : 0
    };
  }

  /**
   * Get monthly P&L breakdown for a fiscal year.
   * @param {number} fy_start_year - The calendar year the fiscal year starts (e.g. 2025 for FY 2025-26)
   */
  async getProfitAndLossMonthly(fy_start_year) {
    const fyStart = `${fy_start_year}-04-01`;
    const fyEnd = `${fy_start_year + 1}-03-31`;

    const query = `
      WITH months AS (
        SELECT generate_series(
          '${fyStart}'::date,
          '${fyEnd}'::date,
          '1 month'::interval
        )::date as month_start
      ),
      revenue AS (
        SELECT date_trunc('month', transaction_date)::date as month,
               COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0)::int as income,
               COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0)::int as refunds
        FROM payment_transactions
        WHERE transaction_date >= '${fyStart}' AND transaction_date <= '${fyEnd}'
        GROUP BY month
      ),
      exp AS (
        SELECT date_trunc('month', expense_date)::date as month,
               COALESCE(SUM(amount), 0)::int as expenses
        FROM expenses
        WHERE expense_date >= '${fyStart}' AND expense_date <= '${fyEnd}'
          AND approval_status = 'approved'
        GROUP BY month
      ),
      pur AS (
        SELECT date_trunc('month', purchase_date)::date as month,
               COALESCE(SUM(amount), 0)::int as purchases
        FROM purchases
        WHERE purchase_date >= '${fyStart}' AND purchase_date <= '${fyEnd}'
        GROUP BY month
      )
      SELECT
        TO_CHAR(m.month_start, 'Mon YYYY') as month_label,
        EXTRACT(MONTH FROM m.month_start)::int as month_num,
        EXTRACT(YEAR FROM m.month_start)::int as year,
        COALESCE(r.income, 0) as revenue,
        COALESCE(r.refunds, 0) as refunds,
        COALESCE(r.income, 0) - COALESCE(r.refunds, 0) as net_revenue,
        COALESCE(e.expenses, 0) as expenses,
        COALESCE(p.purchases, 0) as purchases,
        (COALESCE(r.income, 0) - COALESCE(r.refunds, 0) - COALESCE(e.expenses, 0) - COALESCE(p.purchases, 0)) as profit
      FROM months m
      LEFT JOIN revenue r ON date_trunc('month', m.month_start) = r.month
      LEFT JOIN exp e ON date_trunc('month', m.month_start) = e.month
      LEFT JOIN pur p ON date_trunc('month', m.month_start) = p.month
      ORDER BY m.month_start
    `;

    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = new ReportService();
