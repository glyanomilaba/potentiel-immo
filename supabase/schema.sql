-- Potentiel Immo — structure de base de données pour l'espace client
-- À exécuter dans Supabase : SQL Editor → New query → coller ce script → Run
--
-- Architecture :
--   auth.users (gérée nativement par Supabase, contient email/mot de passe/Google)
--     └── properties (les biens d'un utilisateur — plusieurs biens possibles)
--           └── estimations (l'historique des estimations pour un bien)
--
-- Chaque table a la sécurité RLS (Row Level Security) activée : un
-- utilisateur ne peut voir/modifier que ses propres données, jamais
-- celles d'un autre — appliqué au niveau de la base de données elle-même,
-- donc impossible à contourner même en cas de bug côté code du site.

-- -----------------------------------------------------------
-- Table : properties (un bien immobilier appartenant à un utilisateur)
-- -----------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- libellé affiché dans la liste des biens du compte (ex: "Appartement Paris 15e")
  label text,

  -- réponses du questionnaire, stockées telles quelles (format flexible,
  -- évite d'avoir à modifier la structure de table à chaque nouvelle
  -- question ajoutée au chatbot)
  answers jsonb not null default '{}'::jsonb
);

comment on table public.properties is 'Un bien immobilier associé à un compte utilisateur. Un compte peut avoir plusieurs biens.';

-- -----------------------------------------------------------
-- Table : estimations (historique des calculs pour un bien donné)
-- -----------------------------------------------------------
create table if not exists public.estimations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- résultat complet du moteur d'estimation (vente/location longue/courte),
  -- stocké tel quel en JSON pour garder toute la richesse du calcul
  result jsonb not null default '{}'::jsonb
);

comment on table public.estimations is 'Historique des estimations calculées pour un bien — permet de revoir l''évolution dans le temps.';

-- -----------------------------------------------------------
-- Index pour accélérer les requêtes courantes
-- -----------------------------------------------------------
create index if not exists idx_properties_user_id on public.properties(user_id);
create index if not exists idx_estimations_property_id on public.estimations(property_id);
create index if not exists idx_estimations_user_id on public.estimations(user_id);

-- -----------------------------------------------------------
-- Sécurité : Row Level Security (RLS)
-- -----------------------------------------------------------
alter table public.properties enable row level security;
alter table public.estimations enable row level security;

-- Un utilisateur ne peut voir que ses propres biens
create policy "Users can view their own properties"
  on public.properties for select
  using (auth.uid() = user_id);

-- Un utilisateur ne peut créer des biens que pour lui-même
create policy "Users can insert their own properties"
  on public.properties for insert
  with check (auth.uid() = user_id);

-- Un utilisateur ne peut modifier que ses propres biens
create policy "Users can update their own properties"
  on public.properties for update
  using (auth.uid() = user_id);

-- Un utilisateur ne peut supprimer que ses propres biens
create policy "Users can delete their own properties"
  on public.properties for delete
  using (auth.uid() = user_id);

-- Mêmes règles pour les estimations
create policy "Users can view their own estimations"
  on public.estimations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own estimations"
  on public.estimations for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own estimations"
  on public.estimations for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------
-- Mise à jour automatique de updated_at à chaque modification
-- -----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_properties_updated_at
  before update on public.properties
  for each row
  execute function public.set_updated_at();
