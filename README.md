# Employee Management System

A comprehensive web-based management system for tracking invoices, payments, customers, and sales representatives. Built with React, TypeScript, Vite, Supabase, and Tailwind CSS.

## Features

- **Authentication** - Secure login system using Supabase Auth
- **Invoice Management** - Track cash and credit invoices by total amount
- **Payment Tracking** - Record and monitor customer payments
- **Customer Management** - Maintain customer database with payment history
- **Sales Representatives** - Manage reps and filter data by representative
- **Multiple Reports/Tabs**:
  - Cash Invoices
  - Credit Invoices  
  - Payments
  - Account Statement
  - Monthly Summary
  - Customer Management
- **Data Export** - Export data as CSV
- **Print Support** - Print-optimized views for reports
- **Responsive Design** - Works on desktop and tablet devices
- **RTL Support** - Arabic interface with right-to-left layout

## Tech Stack

- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Routing**: [React Router DOM](https://reactrouter.com/)
- **State Management**: [TanStack Query (React Query)](https://tanstack.com/query)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend/Database**: [Supabase](https://supabase.com/) (PostgreSQL + Auth)
- **UI Icons**: [Lucide React](https://lucide.dev/)
- **Date Utilities**: [date-fns](https://date-fns.org/)
- **Linting**: [Oxlint](https://oxc.rs/docs/guide/usage/linter)

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Supabase project

## Getting Started

### 1. Clone the repository

`ash
git clone https://github.com/your-org/employee-management-system.git
cd "Employee Management System"
`

### 2. Install dependencies

`ash
npm install
`

### 3. Set up environment variables

Create a .env.local file in the root directory with your Supabase credentials:

`env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
`

### 4. Set up the database

The SQL schema and migrations are located in the supabase/ directory. Apply them to your Supabase project:

1. Go to your Supabase project > SQL Editor
2. Run the migration files in order:
   - supabase/migrations/0001_init.sql - Initial schema setup
   - supabase/migrations/0002_views.sql - Database views
   - supabase/migrations/0003_customers_add_phone_and_fix.sql - Customer updates (may be empty)

**Database tables include:**
- invoices - Invoice records (cash and credit) with totals
- payments - Payment transactions
- customers - Customer information
- eps - Sales representatives
- settings - Application settings

### 5. Run the development server

`ash
npm run dev
`

The app will be available at http://localhost:5173.

## Available Scripts

- 
pm run dev - Start development server with hot reload
- 
pm run build - Build for production (TypeScript compilation + Vite build)
- 
pm run lint - Run Oxlint
- 
pm run preview - Preview production build locally

## Project Structure

`
src/
├── assets/          # Images and static assets
├── components/      # Reusable components
│   ├── tabs/        # Tab components (Cash, Credit, Payments, etc.)
│   ├── EditableTable.tsx
│   ├── SearchableCustomer.tsx
│   └── Toast.tsx
├── hooks/           # Custom React hooks (auth, data fetching, etc.)
├── lib/             # Utility functions and configurations
│   ├── supabase.ts  # Supabase client
│   ├── query.ts     # React Query configuration
│   ├── csv.ts       # CSV export utilities
│   └── format.ts    # Formatting helpers
├── pages/           # Page components
│   ├── Login.tsx    # Authentication page
│   └── Sheet.tsx    # Main application page
└── main.tsx         # Application entry point
`

## Usage

1. **Login** - Sign in with your credentials
2. **Manage Reps** - Add/remove sales representatives from the reps section
3. **Add Invoices** - Use Cash or Credit tabs to add new invoices (by total amount)
4. **Track Payments** - Record customer payments in the Payments tab
5. **View Reports** - Use Statement and Monthly tabs for reporting
6. **Manage Customers** - View and manage customer data in the Customers tab
7. **Print/Export** - Use print mode or CSV export for reports

## Contributing

1. Fork the repository
2. Create your feature branch (git checkout -b feature/amazing-feature)
3. Commit your changes (git commit -m 'Add some amazing feature')
4. Push to the branch (git push origin feature/amazing-feature)
5. Open a Pull Request

## License

This project is private and proprietary.
