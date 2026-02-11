import {
  Accessor,
  Match,
  Show,
  Switch,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import {
  TrackLoop,
  TrackReference,
  VideoTrack,
  isTrackReference,
  useEnsureParticipant,
  useIsMuted,
  useIsSpeaking,
  useMaybeTrackRefContext,
  useTrackRefContext,
  useTracks,
} from "solid-livekit-components";

import { Track } from "livekit-client";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { UserContextMenu } from "@revolt/app";
import { useUser } from "@revolt/markdown/users";
import { InRoom } from "@revolt/rtc";
import { Avatar } from "@revolt/ui/components/design";
import { OverflowingText } from "@revolt/ui/components/utils";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { VoiceStatefulUserIcons } from "../VoiceStatefulUserIcons";

import { VoiceCallCardActions } from "./VoiceCallCardActions";
import { VoiceCallCardStatus } from "./VoiceCallCardStatus";

/**
 * Call card (active)
 */
export function VoiceCallCardActiveRoom() {
  return (
    <View>
      <Call>
        <InRoom>
          <Participants />
        </InRoom>
      </Call>

      <VoiceCallCardStatus />
      <VoiceCallCardActions size="sm" />
    </View>
  );
}

const View = styled("div", {
  base: {
    minHeight: 0,
    height: "100%",
    width: "100%",

    gap: "var(--gap-md)",
    padding: "var(--gap-md)",

    display: "flex",
    flexDirection: "column",
  },
});

const Call = styled("div", {
  base: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "scroll",
  },
});

/**
 * Show a grid of participants
 */
function Participants() {
  const [pinnedParticipant, setPinnedParticipant] = createSignal<string | null>(
    null,
  );
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const togglePinnedParticipant = (participantId: string) => {
    setPinnedParticipant((current) =>
      current === participantId ? null : participantId,
    );
  };

  const hasPinnedParticipant = () => pinnedParticipant() !== null;

  return (
    <Grid pinned={hasPinnedParticipant()}>
      <TrackLoop tracks={tracks}>
        {() => (
          <ParticipantTile
            pinnedParticipant={pinnedParticipant}
            onTogglePin={togglePinnedParticipant}
          />
        )}
      </TrackLoop>
      {/* <div class={tile()} />
      <div class={tile()} />
      <div class={tile()} />
      <div class={tile()} />
      <div class={tile()} /> */}
    </Grid>
  );
}

const Grid = styled("div", {
  base: {
    display: "grid",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    alignContent: "start",
  },
  variants: {
    pinned: {
      true: {
        paddingBottom: "calc(var(--gap-xl) * 2)",
      },
    },
  },
});

type ParticipantTileProps = {
  pinnedParticipant: Accessor<string | null>;
  onTogglePin: (participantId: string) => void;
};

/**
 * Individual participant tile
 */
function ParticipantTile(props: ParticipantTileProps) {
  const track = useTrackRefContext();

  return (
    <Switch fallback={<UserTile />}>
      <Match when={track.source === Track.Source.ScreenShare}>
        <ScreenshareTile
          pinnedParticipant={props.pinnedParticipant}
          onTogglePin={props.onTogglePin}
        />
      </Match>
    </Switch>
  );
}

/**
 * Shown when the track source is a camera or placeholder
 */
function UserTile() {
  const participant = useEnsureParticipant();
  const track = useMaybeTrackRefContext();

  const isMicrophoneMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  });

  const isCameraMuted = useIsMuted({
    participant,
    source: Track.Source.Camera,
  });

  const isSpeaking = useIsSpeaking(participant);

  const user = useUser(participant.identity);

  return (
    <div
      class={tile({
        speaking: isSpeaking(),
      })}
      use:floating={{
        userCard: {
          user: user().user!,
          member: user().member,
        },
        contextMenu: () => (
          <UserContextMenu user={user().user!} member={user().member} inVoice />
        ),
      }}
    >
      <Switch
        fallback={
          <AvatarOnly>
            <Avatar
              src={user().avatar}
              fallback={user().username}
              size={48}
              interactive={false}
            />
          </AvatarOnly>
        }
      >
        <Match when={isTrackReference(track) && !isCameraMuted()}>
          <VideoTrack
            style={{ "grid-area": "1/1" }}
            trackRef={track as TrackReference}
            manageSubscription={true}
          />
        </Match>
      </Switch>

      <Overlay>
        <OverlayInner>
          <OverflowingText>{user().username}</OverflowingText>
          <VoiceStatefulUserIcons
            userId={participant.identity}
            muted={isMicrophoneMuted()}
          />
        </OverlayInner>
      </Overlay>
    </div>
  );
}

const AvatarOnly = styled("div", {
  base: {
    gridArea: "1/1",
    display: "grid",
    placeItems: "center",
  },
});

type ScreenshareTileProps = {
  pinnedParticipant: Accessor<string | null>;
  onTogglePin: (participantId: string) => void;
};

/**
 * Shown when the track source is a screenshare
 */
function ScreenshareTile(props: ScreenshareTileProps) {
  const participant = useEnsureParticipant();
  const track = useMaybeTrackRefContext();
  const user = useUser(participant.identity);

  const isMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShareAudio,
  });

  const isPinned = () => props.pinnedParticipant() === participant.identity;

  const [isFullscreen, setIsFullscreen] = createSignal(false);
  let tileRef: HTMLDivElement | undefined;

  const handleFullscreenStateChange = () => {
    if (!tileRef) {
      setIsFullscreen(false);
      return;
    }

    setIsFullscreen(document.fullscreenElement === tileRef);
  };

  onMount(() => {
    document.addEventListener("fullscreenchange", handleFullscreenStateChange);
  });

  onCleanup(() => {
    document.removeEventListener(
      "fullscreenchange",
      handleFullscreenStateChange,
    );
  });

  const handlePinClick = (event: MouseEvent) => {
    event.stopPropagation();
    props.onTogglePin(participant.identity);
  };

  const handleFullscreenClick = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!tileRef) return;

    try {
      if (document.fullscreenElement === tileRef) {
        await document.exitFullscreen();
      } else {
        await tileRef.requestFullscreen();
      }
    } catch (error) {
      console.warn("Unable to toggle fullscreen", error);
    }
  };

  return (
    <div
      class={tile({ pinned: isPinned() }) + " group"}
      ref={(node) => {
        tileRef = node ?? undefined;
      }}
    >
      <VideoTrack
        style={{ "grid-area": "1/1" }}
        trackRef={track as TrackReference}
        manageSubscription={true}
      />

      <Overlay showOnHover>
        <OverlayInner>
          <OverflowingText>{user().username}</OverflowingText>
          <OverlayActions>
            <Show when={isMuted()}>
              <Symbol size={18}>no_sound</Symbol>
            </Show>

            <OverlayIconButton
              type="button"
              aria-label={isPinned() ? "ピン留めを解除" : "ピン留め"}
              aria-pressed={isPinned()}
              onClick={handlePinClick}
              active={isPinned()}
            >
              <Symbol size={18}>push_pin</Symbol>
            </OverlayIconButton>

            <OverlayIconButton
              type="button"
              aria-label={isFullscreen() ? "全画面を終了" : "全画面表示"}
              aria-pressed={isFullscreen()}
              onClick={handleFullscreenClick}
              active={isFullscreen()}
            >
              <Symbol size={18}>
                {isFullscreen() ? "fullscreen_exit" : "fullscreen"}
              </Symbol>
            </OverlayIconButton>
          </OverlayActions>
        </OverlayInner>
      </Overlay>
    </div>
  );
}

const tile = cva({
  base: {
    display: "grid",
    aspectRatio: "16/9",
    transition: ".3s ease all",
    borderRadius: "var(--borderRadius-lg)",

    color: "var(--md-sys-color-on-surface)",
    background: "#0002",

    overflow: "hidden",
    outlineWidth: "3px",
    outlineStyle: "solid",
    outlineOffset: "-3px",
    outlineColor: "transparent",
    order: 0,

    "& video": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
    },
  },
  variants: {
    speaking: {
      true: {
        outlineColor: "var(--md-sys-color-primary)",
      },
    },
    pinned: {
      true: {
        gridColumn: "1 / -1",
        width: "100%",
        maxWidth: "720px",
        justifySelf: "center",
        alignSelf: "start",
        aspectRatio: "16/9",
        minHeight: "auto",
      },
    },
  },
});

const Overlay = styled("div", {
  base: {
    minWidth: 0,
    gridArea: "1/1",

    padding: "var(--gap-md) var(--gap-lg)",

    opacity: 1,
    display: "flex",
    alignItems: "end",
    flexDirection: "row",

    transition: "var(--transitions-fast) all",
    transitionTimingFunction: "ease",
  },
  variants: {
    showOnHover: {
      true: {
        opacity: 0,

        _groupHover: {
          opacity: 1,
        },
      },
      false: {
        opacity: 1,
      },
    },
  },
  defaultVariants: {
    showOnHover: false,
  },
});

const OverlayInner = styled("div", {
  base: {
    minWidth: 0,

    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",

    _first: {
      flexGrow: 1,
    },
  },
});

const OverlayActions = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
  },
});

const OverlayIconButton = styled("button", {
  base: {
    width: "32px",
    height: "32px",
    display: "grid",
    placeItems: "center",
    borderRadius: "999px",
    border: "1px solid transparent",
    background: "rgba(0, 0, 0, 0.55)",
    color: "inherit",
    cursor: "pointer",
    padding: 0,
    transition: "var(--transitions-fast) all",

    _hover: {
      background: "rgba(0, 0, 0, 0.75)",
    },

    _focusVisible: {
      outline: "2px solid var(--md-sys-color-primary)",
      outlineOffset: "2px",
    },
  },
  variants: {
    active: {
      true: {
        background: "var(--md-sys-color-primary)",
        color: "var(--md-sys-color-on-primary)",
      },
    },
  },
});
