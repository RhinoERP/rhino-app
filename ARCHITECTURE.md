# Rhino App - Architecture Documentation

## Project Overview

**Rhino** is a distribution management platform built with modern web technologies. It's a multi-tenant SaaS application that handles inventory, sales, purchases, collections, suppliers, customers, and price lists for distribution businesses.

---

## Tech Stack

### Core Framework

- **Next.js 16.0.10** - React framework with App Router (RSC-enabled)
- **React 19.0.0** - UI library with latest features
- **TypeScript 5.x** - Type-safe JavaScript with strict mode enabled
- **Node.js** - Runtime environment (target: ES2017)

### Backend & Database

- **Supabase** (@supabase/supabase-js ^2.86.0, @supabase/ssr ^0.8.0)
  - PostgreSQL database
  - Authentication & authorization
  - Row Level Security (RLS)
  - Real-time subscriptions
  - Storage

### State Management & Data Fetching

- **TanStack Query v5** (@tanstack/react-query ^5.90.12)
  - Server state management
  - Caching and synchronization
  - Query invalidation
  - DevTools for debugging
- **nuqs ^2.8.3** - Type-safe URL query state management

### UI Framework & Styling

- **Tailwind CSS v4** - Utility-first CSS framework
- **shadcn/ui** - Headless component library (New York style)
- **Radix UI** - Accessible component primitives
  - Dialog, Dropdown Menu, Popover, Select, Tabs, Tooltip, etc.
- **Lucide React** - Icon library
- **Phosphor Icons** - Additional icon set
- **next-themes ^0.4.6** - Dark/light mode theming
- **class-variance-authority** - Component variant styling
- **tailwind-merge** - Utility class merging
- **Framer Motion** (motion ^12.23.25) - Animation library

### Forms & Validation

- **React Hook Form ^7.66.1** - Form state management
- **Zod ^4.1.13** - Schema validation
- **@hookform/resolvers ^5.2.2** - Form validation integration

### Data Tables

- **TanStack Table v8** (@tanstack/react-table ^8.21.3) - Headless table library
- Custom data table implementation with:
  - Sorting
  - Filtering
  - Pagination
  - Column visibility
  - Row selection
  - URL state persistence

### Additional UI Libraries

- **react-day-picker ^9.11.3** - Date picker component
- **date-fns ^4.1.0** - Date utility library
- **recharts ^3.6.0** - Chart and data visualization
- **cmdk ^1.1.1** - Command palette (⌘K)
- **sonner ^2.0.7** - Toast notifications
- **@dnd-kit** - Drag and drop functionality
  - @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/modifiers, @dnd-kit/utilities

### Utilities

- **nanoid ^5.1.6** - ID generation
- **clsx ^2.1.1** - Conditional className utility
- **xlsx ^0.18.5** - Excel file parsing and generation
- **@react-email/components** - Email template components
- **resend ^6.6.0** - Transactional email service

### Code Quality & Tooling

- **Biome 2.3.7** - Fast linter and formatter (Rust-based)
- **Ultracite 6.3.6** - Zero-config Biome preset
- **Husky ^9.1.7** - Git hooks
- **Prettier ^3.7.4** - Code formatting fallback
- **TypeScript strict mode** - Maximum type safety

---

## Project Structure

```
rhino-app/
├── public/                    # Static assets
│   └── images/               # Images, logos, icons
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Home page
│   │   ├── globals.css       # Global styles
│   │   ├── admin/            # Admin routes
│   │   ├── api/              # API routes
│   │   ├── auth/             # Authentication routes
│   │   ├── no-org/           # No organization page
│   │   └── org/              # Organization-specific routes
│   │       └── [orgSlug]/    # Dynamic org routes
│   ├── components/           # React components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── data-table/       # Data table components
│   │   ├── layout/           # Layout components
│   │   ├── auth/             # Auth components
│   │   ├── admin/            # Admin components
│   │   ├── [feature]/        # Feature-specific components
│   │   └── providers.tsx     # Context providers
│   ├── modules/              # Feature modules
│   │   ├── [feature]/
│   │   │   ├── actions/      # Server Actions
│   │   │   ├── service/      # Business logic
│   │   │   ├── queries/      # TanStack Query hooks
│   │   │   ├── hooks/        # React hooks
│   │   │   └── types.ts      # TypeScript types
│   │   ├── admin/
│   │   ├── categories/
│   │   ├── collections/
│   │   ├── customers/
│   │   ├── dashboard/
│   │   ├── email/
│   │   ├── inventory/
│   │   ├── organizations/
│   │   ├── price-lists/
│   │   ├── purchases/
│   │   ├── sales/
│   │   ├── sales-price-lists/
│   │   ├── suppliers/
│   │   └── taxes/
│   ├── hooks/                # Shared custom hooks
│   ├── lib/                  # Utility libraries
│   │   ├── supabase/         # Supabase client setup
│   │   ├── utils.ts          # General utilities
│   │   ├── format.ts         # Formatting helpers
│   │   ├── parsers.ts        # Data parsers
│   │   ├── excel-parser.ts   # Excel parsing
│   │   └── data-table.ts     # Table utilities
│   ├── config/               # Configuration files
│   └── types/                # Global TypeScript types
│       ├── supabase.ts       # Generated DB types
│       └── data-table.ts     # Table types
├── biome.jsonc               # Biome configuration
├── components.json           # shadcn/ui configuration
├── next.config.ts            # Next.js configuration
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies
└── tailwind.config.*         # Tailwind configuration
```

---

## Architecture Patterns

### 1. **Module-Based Architecture**

Each feature is organized as a self-contained module under `src/modules/[feature]/`:

- **`actions/`** - Next.js Server Actions (marked with `"use server"`)
  - Handle form submissions
  - Data mutations
  - Return type-safe results
  - Example: `updateCategoryAction`, `deleteCategoryAction`

- **`service/`** - Business logic and data access layer
  - Database queries via Supabase
  - Business rules and validation
  - Data transformations
  - Example: `getCategoriesByOrgSlug`, `createCategoryForOrg`

- **`queries/`** - TanStack Query hooks
  - Client-side data fetching
  - Caching strategies
  - Query invalidation
  - Example: `useCategories`, `useTaxes`

- **`hooks/`** - Feature-specific React hooks
  - Component logic extraction
  - State management
  - Side effects

- **`types.ts`** - TypeScript type definitions
  - Domain models
  - API contracts
  - Form schemas

### 2. **Server-First Architecture**

The application leverages Next.js App Router with React Server Components (RSC):

- **Server Components** (default)
  - Data fetching at the component level
  - Direct database access via Supabase
  - Reduced client bundle size
  - Better SEO and initial page load

- **Client Components** (`"use client"`)
  - Interactive UI elements
  - Forms and dialogs
  - State management with hooks
  - Event handlers
  - TanStack Query for client-side data

- **Server Actions** (`"use server"`)
  - Type-safe server-side mutations
  - Form handling
  - Progressive enhancement
  - Automatic revalidation

### 3. **Multi-Tenancy**

Organizations are isolated using:

- **URL-based routing**: `/org/[orgSlug]/...`
- **Database-level isolation**: Row Level Security (RLS) in Supabase
- **Scoped queries**: All queries filtered by `orgSlug`

### 4. **Authentication & Authorization**

- **Supabase Auth** for user authentication
- **Row Level Security (RLS)** for database authorization
- **Protected routes** with middleware and guards
- **Role-based access control** (admin vs. organization member)
- **Permission providers** for granular access control

### 5. **Form Management Pattern**

Consistent form handling across the app:

```tsx
// 1. Define Zod schema
const schema = z.object({
  name: z.string().min(1, "Required"),
  date: z.date(),
});

type FormValues = z.infer<typeof schema>;

// 2. Initialize form with react-hook-form
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { ... },
});

// 3. Submit handler calls Server Action
const onSubmit = async (values: FormValues) => {
  const result = await serverAction(values);
  if (result.success) {
    router.refresh(); // Revalidate server data
  }
};

// 4. Render with shadcn Form components
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField control={form.control} name="..." />
  </form>
</Form>
```

### 6. **Data Table Pattern**

Advanced data tables with URL state persistence:

- Custom `useDataTable` hook
- URL-synced pagination, sorting, filtering
- Server-side and client-side filtering
- Column visibility controls
- Row selection
- Debounced search
- Powered by TanStack Table

### 7. **Optimistic UI Updates**

Using TanStack Query for optimistic mutations:

- Immediate UI feedback
- Automatic rollback on error
- Query invalidation and refetching

---

## Code Conventions

### TypeScript Standards

✅ **DO:**

- Use **explicit return types** for exported functions
- Prefer **`unknown`** over **`any`** for unknown types
- Use **const assertions** (`as const`) for literal types
- Leverage **type narrowing** instead of type assertions
- Enable **strict mode** (strictNullChecks, forceConsistentCasingInFileNames)

❌ **DON'T:**

- Use `any` unless absolutely necessary
- Use type assertions without good reason
- Disable TypeScript checks with `@ts-ignore`

### Modern JavaScript/TypeScript

✅ **DO:**

- Use **arrow functions** for callbacks and short functions
- Prefer **`for...of`** loops over `.forEach()` and indexed `for`
- Use **optional chaining** (`?.`) and **nullish coalescing** (`??`)
- Use **template literals** over string concatenation
- Use **destructuring** for objects and arrays
- Use **`const`** by default, `let` only for reassignment
- Extract **magic numbers** into named constants

❌ **DON'T:**

- Use `var` (always use `const` or `let`)
- Use array index `for` loops when `for...of` works
- Chain multiple ternary operators

### Async/Await

✅ **DO:**

- Always **`await`** promises in async functions
- Use **`async/await`** syntax instead of promise chains
- Handle errors with **try-catch** blocks in async code
- Return values from async functions

❌ **DON'T:**

- Forget to `await` promises
- Use async functions as Promise executors
- Ignore promise rejections

### React & Component Standards

✅ **DO:**

- Use **function components** (no class components)
- Call hooks at the **top level only**, never conditionally
- Specify **all dependencies** in hook dependency arrays
- Use **unique IDs** for `key` prop in lists (not array indices)
- Nest children between opening and closing tags
- Use **semantic HTML** (button, nav, article, etc.)
- Add **ARIA attributes** for accessibility
- Provide **meaningful alt text** for images
- Use proper **heading hierarchy** (h1, h2, h3)
- Add **labels** for form inputs
- Use **ref as a prop** (React 19+, not `forwardRef`)

❌ **DON'T:**

- Define components inside other components
- Use array indices as keys
- Pass children as props (use composition)
- Use `<div>` with `onClick` (use `<button>`)
- Use `className` for non-React libraries (use `class`)

### File Naming

- **Components**: PascalCase (`EditPriceListDialog.tsx`)
- **Hooks**: camelCase with `use` prefix (`use-data-table.ts`)
- **Utils/Libs**: kebab-case (`excel-parser.ts`)
- **Types**: PascalCase for types/interfaces
- **Server Actions**: kebab-case with `.action.ts` suffix
- **Services**: kebab-case with `.service.ts` suffix

### Import Organization

Imports are automatically organized by Biome:

```tsx
// 1. External dependencies
import { useState } from "react";
import { useForm } from "react-hook-form";

// 2. Internal imports (alphabetically via @/ alias)
import { Button } from "@/components/ui/button";
import { updateAction } from "@/modules/feature/actions";
```

### Component Structure

```tsx
"use client"; // if client component

// 1. Imports
import { ... } from "...";

// 2. Types/Interfaces
type Props = {
  ...
};

// 3. Constants
const SCHEMA = z.object({ ... });

// 4. Component
export function ComponentName({ ... }: Props) {
  // 4a. Hooks (always at top level)
  const [state, setState] = useState();
  const form = useForm();

  // 4b. Event handlers
  const handleSubmit = async () => { ... };

  // 4c. Effects
  useEffect(() => { ... }, []);

  // 4d. Early returns
  if (!data) return null;

  // 4e. Render
  return <div>...</div>;
}
```

### Error Handling

✅ **DO:**

- Throw **`Error` objects** with descriptive messages
- Use **try-catch** blocks meaningfully
- Provide **user-friendly error messages**
- Handle edge cases and boundary conditions

❌ **DON'T:**

- Throw strings or other non-Error values
- Use `console.log`, `debugger`, or `alert` in production
- Catch errors just to rethrow them

### Code Quality

- **Remove unused imports** and variables (Biome enforces this)
- **Keep functions focused** - single responsibility
- **Extract complex conditions** into named boolean variables
- **Use early returns** to reduce nesting
- **Avoid excessive nesting** (max 3-4 levels)
- **Write self-documenting code** with clear variable names
- **Add comments only for complex logic**
- **Keep cognitive complexity low**

---

## Styling Conventions

### Tailwind CSS

- Use **utility classes** for styling
- Use **`cn()`** utility for conditional classes
- Define **CSS variables** in `globals.css` for theming
- Use **responsive modifiers** (sm:, md:, lg:, xl:)
- Use **dark mode** with `dark:` prefix
- Leverage **Tailwind plugins**: tailwindcss-animate

### Component Variants

Use `class-variance-authority` for variant styling:

```tsx
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "...",
        outline: "...",
      },
      size: {
        sm: "...",
        lg: "...",
      },
    },
    defaultVariants: { ... },
  }
);
```

### Font System

Multiple font families configured:

- **Sans**: Inter (default body text)
- **Heading**: Cal Sans
- **Serif**: Merriweather
- **Mono**: JetBrains Mono
- **Display**: Space Grotesk

---

## Database & API Conventions

### Supabase Client Usage

**Server Components / Server Actions:**

```tsx
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();
const { data } = await supabase.from("table").select();
```

**Client Components:**

```tsx
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const { data } = await supabase.from("table").select();
```

### Database Naming

- **Tables**: snake_case, plural (e.g., `price_lists`, `organizations`)
- **Columns**: snake_case (e.g., `valid_from`, `org_slug`)
- **Foreign keys**: `<table>_id` (e.g., `category_id`, `org_id`)

### Type Safety

- Generated types in `src/types/supabase.ts`
- Type-safe database queries
- Zod schemas for validation
- Type inference from schemas using `z.infer<typeof schema>`

---

## Testing Strategy

Currently configured:

```json
"test": "pnpm lint"
```

The test command runs linting via Biome. Future testing may include:

- Unit tests (Jest/Vitest)
- Component tests (React Testing Library)
- E2E tests (Playwright)

---

## Build & Deployment

### Scripts

```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Check code quality
pnpm lint:fix     # Auto-fix issues
```

### Environment Variables

Required:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- Other Supabase and service credentials

### Linting & Formatting

**Biome** with **Ultracite** preset:

- Extends `ultracite/core` and `ultracite/next`
- Excludes: `src/components/ui`, `src/types/supabase.ts`, `src/components/data-table`, `supabase/functions`
- Auto-fixes most issues
- Fast Rust-based execution

**Pre-commit hooks:**

- Husky configured for Git hooks
- Runs linting before commit

---

## Performance Optimizations

1. **Server Components by default** - Reduced client bundle
2. **Dynamic imports** for code splitting
3. **Image optimization** with Next.js Image component
4. **TanStack Query caching** - Reduces redundant requests
5. **Debounced search inputs** - Reduces API calls
6. **URL state persistence** - Maintains state across navigation
7. **Cache components disabled** in Next.js config for critical routes

---

## Accessibility (a11y)

- Semantic HTML elements
- ARIA attributes on interactive elements
- Keyboard navigation support
- Focus management in modals/dialogs
- Screen reader friendly labels
- Color contrast compliance
- Responsive design for all screen sizes

---

## Security Best Practices

- **Row Level Security (RLS)** in Supabase
- **Environment variable** protection
- **Input validation** with Zod schemas
- **XSS prevention** - No `dangerouslySetInnerHTML`
- **CSRF protection** via Server Actions
- **Secure authentication** via Supabase Auth
- **`rel="noopener"` on external links**

---

## Key Design Decisions

1. **Server Components First**: Maximize server rendering for performance and SEO
2. **TanStack Query**: Robust client-side state management and caching
3. **Server Actions**: Type-safe mutations without API routes
4. **shadcn/ui**: Composable, accessible component library
5. **Biome + Ultracite**: Fast, opinionated linting and formatting
6. **Module-based structure**: Feature isolation and scalability
7. **URL state management**: Shareable, bookmarkable application state
8. **Multi-tenant architecture**: Organization-scoped data access
9. **Type safety everywhere**: End-to-end type safety from DB to UI
10. **Monorepo structure**: All features in one repository

---

## Development Workflow

1. **Create feature branch** from main
2. **Develop in modules** (`src/modules/[feature]/`)
3. **Create Server Actions** for mutations
4. **Build UI components** in `src/components/[feature]/`
5. **Run `pnpm lint:fix`** to auto-fix issues
6. **Test locally** with `pnpm dev`
7. **Commit with descriptive messages** (Husky runs pre-commit hooks)
8. **Create pull request** for review
9. **Deploy** to production after merge

---

## Common Patterns & Examples

### Server Action Pattern

```tsx
"use server";

import { revalidatePath } from "next/cache";

type ActionResult = {
  success: boolean;
  error?: string;
  data?: T;
};

export async function myAction(params: Params): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Business logic
    const { data, error } = await supabase.from("table").insert(params);

    if (error) throw error;

    revalidatePath("/path");
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

### TanStack Query Hook Pattern

```tsx
import { useQuery } from "@tanstack/react-query";

export function useMyData(orgSlug: string) {
  return useQuery({
    queryKey: ["myData", orgSlug],
    queryFn: async () => {
      const data = await fetchDataService(orgSlug);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### Dialog with Form Pattern

```tsx
"use client";

export function MyDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm({ ... });

  const onSubmit = async (values) => {
    const result = await myAction(values);
    if (result.success) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Form fields */}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Biome Documentation](https://biomejs.dev)
- [Ultracite Documentation](https://ultracite.dev)

---

## Maintenance

- **Dependencies**: Update regularly with `pnpm update`
- **Security**: Monitor with `pnpm audit`
- **Types**: Regenerate Supabase types when schema changes
- **Linting**: Run `pnpm lint` before commits
- **Documentation**: Update this file when architecture changes

---

**Last Updated**: January 26, 2026
