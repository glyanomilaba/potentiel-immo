-- Potentiel Immo — correctif : permissions manquantes sur les tables
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run
--
-- Cause du bug "permission denied for table properties" (code 42501) :
-- les politiques RLS définissent QUI peut voir QUELLES lignes, mais ne
-- suffisent pas à elles seules — il faut en plus accorder, au niveau de
-- la table elle-même, le droit de base d'exécuter ces opérations (SELECT,
-- INSERT, UPDATE, DELETE) au rôle "authenticated" (tout utilisateur
-- connecté). C'est cette étape qui manquait dans le script initial.

grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, delete on public.estimations to authenticated;

-- Les séquences ne sont pas concernées ici car les tables utilisent
-- gen_random_uuid() comme identifiant, pas une séquence auto-incrémentée
-- classique — donc aucun GRANT supplémentaire n'est nécessaire sur ce point.
