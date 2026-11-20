"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { getApiErrorMessage } from "@/lib/axios";
import { useDeleteAvatar, useUploadAvatar } from "@/modules/profile/hooks/use-profile";
import { AVATAR_TYPES, avatarFileError } from "@/modules/profile/schemas/profile.schema";
import type { Profile } from "@/modules/profile/types/profile.types";

/** Foto de perfil: o arquivo vai para a API e é servido por ela (nenhuma imagem de outro site). */
export function AvatarUpload({ profile }: { profile: Profile }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const busy = upload.isPending || remove.isPending;

  const onFile = (file: File | undefined) => {
    if (input.current) input.current.value = ""; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    const invalid = avatarFileError(file);
    if (invalid) {
      setMessage({ text: invalid, error: true });
      return;
    }
    setMessage(null);
    upload.mutate(file, {
      onSuccess: () => setMessage({ text: "Foto atualizada." }),
      onError: (error) => setMessage({ text: getApiErrorMessage(error, "Não foi possível enviar a foto. Tente novamente."), error: true }),
    });
  };

  return <div className="space-y-3">
    <p className="text-sm font-medium">Foto de perfil (opcional)</p>
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={profile.name} src={profile.avatarUrl} />
      <input ref={input} id="avatar" type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" onChange={(event) => onFile(event.target.files?.[0])} aria-describedby="avatar-hint" />
      <Button type="button" variant="outline" size="sm" disabled={busy} loading={upload.isPending} loadingText="Enviando..." onClick={() => input.current?.click()}><ImageUp aria-hidden="true" className="size-4" />Escolher imagem</Button>
      {profile.avatarUrl && <Button type="button" variant="ghost" size="sm" disabled={busy} loading={remove.isPending} loadingText="Removendo..." onClick={() => remove.mutate(undefined, {
        onSuccess: () => setMessage({ text: "Foto removida." }),
        onError: (error) => setMessage({ text: getApiErrorMessage(error, "Não foi possível remover a foto."), error: true }),
      })}><Trash2 aria-hidden="true" className="size-4" />Remover</Button>}
    </div>
    <p id="avatar-hint" className="text-xs text-muted-foreground">PNG, JPEG ou WebP, até 256 KB.</p>
    {message && <Feedback error={message.error}>{message.text}</Feedback>}
  </div>;
}
