import { mysqlTable, varchar, timestamp, boolean } from 'drizzle-orm/mysql-core';

// جدول المستخدمين
// users table
export const users = mysqlTable('users', {
  // المعرف الفريد للمستخدم
  // unique user ID
  id: varchar('id', { length: 36 }).primaryKey(),
  
  // البريد الإلكتروني
  // email address
  email: varchar('email', { length: 255 }).notNull().unique(),
  
  // كلمة المرور (مشفرة)
  // password (hashed)
  password: varchar('password', { length: 255 }).notNull(),
  
  // اسم المستخدم
  // username
  username: varchar('username', { length: 100 }),
  
  // هل الحساب مفعّل؟
  // is account active?
  isActive: boolean('is_active').default(true),
  
  // تاريخ الإنشاء
  // creation date
  createdAt: timestamp('created_at').defaultNow(),
  
  // تاريخ آخر تحديث
  // last update date
  updatedAt: timestamp('updated_at').defaultNow(),
});
