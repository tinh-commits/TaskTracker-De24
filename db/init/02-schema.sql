CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(40) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK(role IN ('admin','member')),
    password_hash VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.tasks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(1500) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','done')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    due_date DATE,
    assigned_to BIGINT REFERENCES public.users(id),
    created_by BIGINT NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON public.tasks(status,due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON public.tasks(created_by);
