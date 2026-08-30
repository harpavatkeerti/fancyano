/**
 * expenseService.js
 *
 * All database logic for expense tracking.
 * Route handlers must NOT import pool directly — delegate here instead.
 */

const pool = require('../database/connection');
const inAppNotificationService = require('./inAppNotificationService');

class ExpenseService {
  /**
   * Create a new expense entry.
   * @param {Object} data - { category, amount, description, expense_date, recorded_by }
   * @returns {Promise<Object>} - Created expense row
   */
  async create({ category, amount, description, expense_date, recorded_by, user_role }) {
    if (!category || !category.trim()) {
      const err = new Error('Category is required');
      err.status = 400;
      throw err;
    }
    if (!amount || amount <= 0) {
      const err = new Error('Amount must be a positive number');
      err.status = 400;
      throw err;
    }
    if (!recorded_by) {
      const err = new Error('Recorded by is required');
      err.status = 400;
      throw err;
    }

    const approvalStatus = user_role === 'admin' ? 'approved' : 'pending';
    const approvedBy = user_role === 'admin' ? recorded_by : null;
    const approvedAt = user_role === 'admin' ? new Date() : null;

    const result = await pool.query(
      `INSERT INTO expenses (category, amount, description, expense_date, recorded_by, approval_status, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [category.trim(), amount, description?.trim() || null, expense_date || new Date(), recorded_by, approvalStatus, approvedBy, approvedAt]
    );
    const row = result.rows[0];

    // Notify admin when a non-admin creates an expense
    if (user_role !== 'admin') {
      try {
        await inAppNotificationService.create({
          recipient_role: 'admin',
          title: 'Expense Request',
          message: `${recorded_by} submitted an expense of \u20b9${amount} in "${category.trim()}"`,
          type: 'action_required',
          reference_type: 'expense',
          reference_id: row.id
        });
      } catch (notifErr) {
        console.error('Failed to create notification:', notifErr);
      }
    }

    return row;
  }

  /**
   * List expenses with optional filters.
   * @param {Object} filters - { category, start_date, end_date }
   * @returns {Promise<Array>} - Expense rows
   */
  async list({ category, start_date, end_date, recorded_by } = {}) {
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (start_date) {
      params.push(start_date);
      query += ` AND expense_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND expense_date <= $${params.length}`;
    }

    if (recorded_by) {
      params.push(recorded_by);
      query += ` AND recorded_by = $${params.length}`;
    }

    query += ' ORDER BY expense_date DESC, created_at DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single expense by ID.
   * @param {number} id
   * @returns {Promise<Object>} - Expense row
   */
  async getById(id) {
    const result = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Expense not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Update an expense.
   * @param {number} id
   * @param {Object} data - { category, amount, description, expense_date }
   * @returns {Promise<Object>} - Updated expense row
   */
  async update(id, { category, amount, description, expense_date }) {
    await this.getById(id); // throws 404 if not found

    const result = await pool.query(
      `UPDATE expenses 
       SET category = COALESCE($1, category),
           amount = COALESCE($2, amount),
           description = COALESCE($3, description),
           expense_date = COALESCE($4, expense_date)
       WHERE id = $5
       RETURNING *`,
      [category, amount, description, expense_date, id]
    );
    return result.rows[0];
  }

  /**
   * Delete an expense.
   * @param {number} id
   * @returns {Promise<Object>} - Deleted expense row
   */
  async delete(id) {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      const err = new Error('Expense not found');
      err.status = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Approve a pending expense.
   * @param {number} id
   * @param {string} approved_by - Admin username
   * @returns {Promise<Object>} - Updated expense row
   */
  async approve(id, approved_by) {
    const expense = await this.getById(id);

    if (expense.approval_status !== 'pending') {
      const err = new Error(`Cannot approve expense with status: ${expense.approval_status}`);
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `UPDATE expenses 
       SET approval_status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [approved_by, id]
    );
    return result.rows[0];
  }

  /**
   * Reject a pending expense.
   * @param {number} id
   * @param {string} rejected_by - Admin username
   * @returns {Promise<Object>} - Updated expense row
   */
  async reject(id, rejected_by) {
    const expense = await this.getById(id);

    if (expense.approval_status !== 'pending') {
      const err = new Error(`Cannot reject expense with status: ${expense.approval_status}`);
      err.status = 400;
      throw err;
    }

    const result = await pool.query(
      `UPDATE expenses 
       SET approval_status = 'rejected', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [rejected_by, id]
    );
    return result.rows[0];
  }

  /**
   * Get count of pending expenses (for admin notification badge).
   * @returns {Promise<number>} - Count of pending expenses
   */
  async getPendingCount() {
    const result = await pool.query(
      "SELECT COUNT(*)::int as count FROM expenses WHERE approval_status = 'pending'"
    );
    return result.rows[0].count;
  }

  /**
   * Get expense summary grouped by category for a date range.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Array>} - { category, total_amount, count }
   */
  async getSummaryByCategory({ start_date, end_date } = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND expense_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND expense_date <= $${params.length}`;
    }

    const query = `
      SELECT 
        category,
        COALESCE(SUM(amount), 0)::int as total_amount,
        COUNT(*)::int as count
      FROM expenses
      ${whereClause}
      AND approval_status = 'approved'
      GROUP BY category
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get daily expense totals for a date range.
   * @param {Object} filters - { start_date, end_date }
   * @returns {Promise<Array>} - { expense_date, total }
   */
  async getDailyTotals({ start_date, end_date } = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (start_date) {
      params.push(start_date);
      whereClause += ` AND expense_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      whereClause += ` AND expense_date <= $${params.length}`;
    }

    const query = `
      SELECT 
        expense_date,
        COALESCE(SUM(amount), 0)::int as total
      FROM expenses
      ${whereClause}
      AND approval_status = 'approved'
      GROUP BY expense_date
      ORDER BY expense_date DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // ── Recurring Expenses ────────────────────────────────────────────────

  /**
   * Create a recurring expense.
   * @param {Object} data - { category, amount, description, created_by, next_due_date }
   */
  async createRecurring({ category, amount, description, created_by, next_due_date, user_role }) {
    if (!category?.trim()) { const e = new Error('Category is required'); e.status = 400; throw e; }
    if (!amount || amount <= 0) { const e = new Error('Amount must be positive'); e.status = 400; throw e; }
    if (!created_by) { const e = new Error('Created by is required'); e.status = 400; throw e; }

    // Default next_due_date to 1st of next month if not provided
    if (!next_due_date) {
      const now = new Date();
      next_due_date = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
    }

    const approvalStatus = user_role === 'admin' ? 'approved' : 'pending';
    const approvedBy = user_role === 'admin' ? created_by : null;
    const approvedAt = user_role === 'admin' ? new Date() : null;

    const result = await pool.query(
      `INSERT INTO recurring_expenses (category, amount, description, created_by, next_due_date, approval_status, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [category.trim(), amount, description?.trim() || null, created_by, next_due_date, approvalStatus, approvedBy, approvedAt]
    );

    const row = result.rows[0];

    // Notify admin when a non-admin creates a recurring expense
    if (user_role !== 'admin') {
      try {
        await inAppNotificationService.create({
          recipient_role: 'admin',
          title: 'Recurring Expense Request',
          message: `${created_by} submitted a recurring expense of \u20b9${amount}/mo in "${category.trim()}"`,
          type: 'action_required',
          reference_type: 'recurring_expense',
          reference_id: row.id
        });
      } catch (notifErr) {
        console.error('Failed to create notification:', notifErr);
      }
    }

    return row;
  }

  /**
   * List all recurring expenses.
   * @param {Object} filters - { active_only }
   */
  async listRecurring({ active_only = false } = {}) {
    let query = 'SELECT * FROM recurring_expenses';
    if (active_only) query += ' WHERE is_active = TRUE';
    query += ' ORDER BY category, created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Delete a recurring expense.
   */
  async deleteRecurring(id) {
    const result = await pool.query('DELETE FROM recurring_expenses WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) { const e = new Error('Recurring expense not found'); e.status = 404; throw e; }
    return result.rows[0];
  }

  /**
   * Deactivate (pause) a recurring expense.
   */
  async deactivateRecurring(id) {
    const result = await pool.query(
      'UPDATE recurring_expenses SET is_active = FALSE WHERE id = $1 RETURNING *', [id]
    );
    if (result.rows.length === 0) { const e = new Error('Recurring expense not found'); e.status = 404; throw e; }
    return result.rows[0];
  }

  /**
   * Reactivate a recurring expense.
   */
  async activateRecurring(id) {
    // Set next_due_date to 1st of current month if it's in the past
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const result = await pool.query(
      `UPDATE recurring_expenses 
       SET is_active = TRUE, 
           next_due_date = CASE WHEN next_due_date < $1 THEN $1 ELSE next_due_date END
       WHERE id = $2 RETURNING *`,
      [firstOfMonth, id]
    );
    if (result.rows.length === 0) { const e = new Error('Recurring expense not found'); e.status = 404; throw e; }
    return result.rows[0];
  }

  /**
   * Process all due recurring expenses.
   * Creates actual expense entries for each recurring expense whose next_due_date <= today.
   * Advances next_due_date to 1st of next month.
   * @returns {Promise<Array>} - Created expense entries
   */
  async processDueRecurring() {
    const today = new Date().toISOString().split('T')[0];

    // Find all active, approved recurring expenses that are due
    const dueResult = await pool.query(
      "SELECT * FROM recurring_expenses WHERE is_active = TRUE AND approval_status = 'approved' AND next_due_date <= $1",
      [today]
    );

    const created = [];
    for (const rec of dueResult.rows) {
      // Create the actual expense entry — template is already approved, so entry is auto-approved
      const expense = await this.create({
        category: rec.category,
        amount: rec.amount,
        description: rec.description ? `${rec.description} (Recurring)` : `${rec.category} (Recurring)`,
        expense_date: rec.next_due_date,
        recorded_by: rec.created_by,
        // Template already passed approval_status='approved' filter (line 393),
        // so generated entries are pre-approved — no need for re-approval each month
        user_role: 'admin'
      });
      created.push(expense);

      // Advance next_due_date to 1st of next month
      const dueDate = new Date(rec.next_due_date);
      const nextMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 1);
      const nextDue = nextMonth.toISOString().split('T')[0];

      await pool.query(
        'UPDATE recurring_expenses SET next_due_date = $1, last_created_date = $2 WHERE id = $3',
        [nextDue, rec.next_due_date, rec.id]
      );
    }

    return created;
  }

  /**
   * Approve a pending recurring expense.
   * @param {number} id
   * @param {string} approved_by - Admin username
   * @returns {Promise<Object>} - Updated recurring expense row
   */
  async approveRecurring(id, approved_by) {
    const result = await pool.query(
      'SELECT * FROM recurring_expenses WHERE id = $1', [id]
    );
    if (result.rows.length === 0) { const e = new Error('Recurring expense not found'); e.status = 404; throw e; }

    const rec = result.rows[0];
    if (rec.approval_status !== 'pending') {
      const e = new Error(`Cannot approve recurring expense with status: ${rec.approval_status}`);
      e.status = 400; throw e;
    }

    const updated = await pool.query(
      `UPDATE recurring_expenses 
       SET approval_status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [approved_by, id]
    );
    return updated.rows[0];
  }

  /**
   * Reject a pending recurring expense.
   * @param {number} id
   * @param {string} rejected_by - Admin username
   * @returns {Promise<Object>} - Updated recurring expense row
   */
  async rejectRecurring(id, rejected_by) {
    const result = await pool.query(
      'SELECT * FROM recurring_expenses WHERE id = $1', [id]
    );
    if (result.rows.length === 0) { const e = new Error('Recurring expense not found'); e.status = 404; throw e; }

    const rec = result.rows[0];
    if (rec.approval_status !== 'pending') {
      const e = new Error(`Cannot reject recurring expense with status: ${rec.approval_status}`);
      e.status = 400; throw e;
    }

    const updated = await pool.query(
      `UPDATE recurring_expenses 
       SET approval_status = 'rejected', approved_by = $1, approved_at = CURRENT_TIMESTAMP, is_active = FALSE
       WHERE id = $2
       RETURNING *`,
      [rejected_by, id]
    );
    return updated.rows[0];
  }
}

module.exports = new ExpenseService();

