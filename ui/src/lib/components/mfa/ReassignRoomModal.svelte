<script lang="ts">
  import { formatTicketCode } from '@praxis-flow/domain';
  import { ArrowRight } from '@lucide/svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { defaultCallRoom, listEnabledRooms, type PracticeRoom } from '$lib/queue/ops-settings-api';
  import { roomHasCapacity } from '$lib/queue/room-capacity';
  import { toRoomTarget } from '$lib/queue/room-target';
  import type { QueueItem } from '$lib/queue/types';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface TicketRef {
    visitId: string;
    laneCode: string;
    number: number;
    roomId?: string | null;
  }

  interface Props {
    ticket?: TicketRef | null;
    rooms?: PracticeRoom[];
    activeItems?: QueueItem[];
    busy?: boolean;
    onConfirm?: (roomId: string, roomLabel: string) => void;
    onCancel?: () => void;
  }

  let { ticket = null, rooms = [], activeItems = [], busy = false, onConfirm, onCancel }: Props = $props();

  const open = $derived(ticket != null);
  const ticketLabel = $derived(
    ticket != null ? formatTicketCode(ticket.laneCode, ticket.number) : '',
  );
  const enabledRooms = $derived(listEnabledRooms(rooms));
  let selectedRoomId = $state<string | null>(null);
  const selectedRoom = $derived(enabledRooms.find((room) => room.roomId === selectedRoomId) ?? null);

  $effect(() => {
    if (!ticket) {
      selectedRoomId = null;
      return;
    }
    const current = ticket.roomId?.trim();
    selectedRoomId =
      current && enabledRooms.some((room) => room.roomId === current)
        ? current
        : (defaultCallRoom(rooms)?.roomId ?? enabledRooms[0]?.roomId ?? null);
  });

  function handleClose() {
    onCancel?.();
  }

  function roomIsSelectable(room: PracticeRoom): boolean {
    if (ticket?.roomId === room.roomId) {
      return true;
    }
    return roomHasCapacity(rooms, activeItems, room.roomId, ticket?.visitId);
  }

  function submit(event: Event) {
    event.preventDefault();
    const room = selectedRoom;
    const target = toRoomTarget(room);
    if (!target || !room || !roomIsSelectable(room)) {
      return;
    }
    onConfirm?.(target.roomId, target.roomLabel);
  }
</script>

<Modal
  {open}
  dimBackdrop={true}
  maxWidth="420px"
  headerClass="modal-header--hero bg-gradient-primary"
  closeOnEscape={!busy}
  onClose={handleClose}
>
  {#snippet header()}
    <div class="modal-header__left">
      <div class="modal-header__icon">
        <ArrowRight size={18} aria-hidden="true" />
      </div>
      <div class="modal-header__texts">
        <h2 id="modal-title" class="modal-title">{t('mfa.reassignModalTitle')}</h2>
        {#if ticket}
          <p class="modal-subtitle modal-subtitle--pre-line">
            {tf('mfa.reassignModalDesc', { ticket: ticketLabel })}
          </p>
        {/if}
      </div>
    </div>
  {/snippet}

  <form class="modal-form" onsubmit={submit}>
    {#if enabledRooms.length === 0}
      <p class="text-muted">{t('mfa.reassignNoRooms')}</p>
    {:else}
      <div class="qs-room-list" role="listbox" aria-label={t('mfa.reassignRoomListAria')}>
        {#each enabledRooms as room (room.roomId)}
          <button
            type="button"
            class="qs-room-chip"
            class:qs-room-chip--active={room.roomId === selectedRoomId}
            role="option"
            aria-selected={room.roomId === selectedRoomId}
            disabled={busy || !roomIsSelectable(room)}
            onclick={() => {
              if (!roomIsSelectable(room)) {
                return;
              }
              selectedRoomId = room.roomId;
            }}
          >
            {room.roomLabel}
          </button>
        {/each}
      </div>
    {/if}

    <div class="form-actions">
      <Button type="button" variant="outline" disabled={busy} onclick={handleClose}>
        {t('ui.cancel')}
      </Button>
      <Button
        type="submit"
        variant="primary"
        disabled={busy || !selectedRoom || !roomIsSelectable(selectedRoom)}
      >
        {busy ? t('mfa.reassignSubmitting') : t('mfa.reassignSubmit')}
      </Button>
    </div>
  </form>
</Modal>
