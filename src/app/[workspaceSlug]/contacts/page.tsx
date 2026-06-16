import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { listWorkspaceContacts } from "@/server/queries/contacts";
import { ContactsList } from "@/components/workspace/contacts-list";

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const contacts = await listWorkspaceContacts(workspace.id);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {contacts.length} {contacts.length === 1 ? "person" : "people"} in{" "}
          {workspace.name}. Linked to deals on CRM boards and tickets on Support
          boards.
        </p>
      </header>
      <ContactsList
        workspaceId={workspace.id}
        contacts={contacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
          dealCount: c._count.deals,
          ticketCount: c._count.tickets,
          archivedAt: c.archivedAt,
        }))}
      />
    </main>
  );
}
