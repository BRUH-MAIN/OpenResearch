import { redirect } from 'next/navigation';

interface ChatPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const sessionId = resolvedSearchParams.sessionId;
  const resolvedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  if (resolvedSessionId) {
    redirect(`/research?sessionId=${encodeURIComponent(resolvedSessionId)}`);
  }

  redirect('/research');
}
