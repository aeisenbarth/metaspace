import Vue from 'vue'
import { computed, defineComponent, reactive, Ref, ref, SetupContext, watch } from '@vue/composition-api'

import { getOS, scrollDistance, WheelEventCompat } from '../lib/util'
import createColormap, { OpacityMode } from '../lib/createColormap'
import config from '../lib/config'
import { renderIonImage } from '../lib/ionImageRendering'
import ScaleBar from './ScaleBar.vue'
import { throttle } from 'lodash-es'
import { ReferenceObject } from 'popper.js'
import { templateRef } from '../lib/templateRef'

const formatMatrix3d = (t: readonly number[][]) =>
  `matrix3d(${t[0][0]}, ${t[1][0]}, 0, ${t[2][0]},
             ${t[0][1]}, ${t[1][1]}, 0, ${t[2][1]},
                      0,          0, 1,          0,
             ${t[0][2]}, ${t[1][2]}, 0, ${t[2][2]})`

interface Props {
  ionImage: any | null
  isLoading: boolean
  // width & height of HTML element
  width: number
  height: number
  // zoom factor where 1.0 means 1 ion image pixel per browser pixel
  zoom: number
  minZoom: number
  maxZoom: number
  // x & y coordinates to offset the center of the image in ion image pixel units. As long as these remain constant
  // the ion image pixel at the center will stay in the same place regardless of zoom level.
  // xOffset=0, yOffset=0 will center the ion image.
  xOffset: number
  yOffset: number
  colormap: string
  opticalSrc: string | null
  annotImageOpacity: number
  opacityMode: OpacityMode
  ionImageTransform: number[][]
  opticalTransform: number[][]
  scrollBlock: boolean
  pixelSizeX: number
  pixelSizeY: number
  pixelAspectRatio: number
  scaleBarColor: string
  showPixelIntensity: boolean
}

const useScrollBlock = () => {
  const state = reactive({
    tmId: null as any,
    overlayFadingIn: false,
  })

  const messageOS = computed(() => {
    const os = getOS()

    if (os === 'Linux' || os === 'Windows') {
      return 'CTRL + scroll the mouse wheel'
    } else if (os === 'Mac OS') {
      return 'CMD ⌘ + scroll the mouse wheel'
    } else if (os === 'Android' || os === 'iOS') {
      return 'two fingers'
    } else {
      return 'CTRL + scroll wheel'
    }
  })

  const showScrollBlock = () => {
    state.overlayFadingIn = true
    if (state.tmId !== 0) {
      clearTimeout(state.tmId)
    }
    state.tmId = setTimeout(() => {
      state.overlayFadingIn = false
    }, 1100)
  }
  const renderScrollBlock = () => (<div
    class={{
      'absolute inset-0 z-30 pointer-events-none bg-body flex items-center justify-center': true,
      'opacity-0 duration-1000': !state.overlayFadingIn,
      'opacity-75 duration-700': state.overlayFadingIn,
    }}
  >
    <p class="relative block z-40 m-0 text-white text-2xl">
      Use { messageOS.value } to zoom the image
    </p>
  </div>)

  return { showScrollBlock, renderScrollBlock }
}

const useScaleBar = (props: Props) => {
  const xScale = computed(() => {
    if (props.ionImage != null && props.pixelSizeX != null && props.pixelSizeX !== 0) {
      return props.pixelSizeX / props.zoom
    } else {
      return 1
    }
  })
  const yScale = computed(() => {
    if (props.ionImage != null && props.pixelSizeY != null && props.pixelSizeY !== 0) {
      return props.pixelSizeY / props.zoom * props.pixelAspectRatio
    } else {
      return 1
    }
  })

  const renderScaleBar = () => {
    return props.scaleBarColor && <ScaleBar
      x-scale={xScale.value}
      y-scale={yScale.value}
      scale-bar-color={props.scaleBarColor}
    />
  }
  return { renderScaleBar }
}

const usePixelIntensityDisplay = (props: Props, imageLoaderRef: Ref<ReferenceObject | null>) => {
  const pixelIntensityTooltipRef = templateRef<any>('pixelIntensityTooltip')
  const cursorPixelPos = ref<[number, number] | null>(null)
  const zoomX = computed(() => props.zoom)
  const zoomY = computed(() => props.zoom / props.pixelAspectRatio)
  const cursorOverPixelIntensity = computed(() => {
    if (props.ionImage != null && cursorPixelPos.value != null) {
      const [x, y] = cursorPixelPos.value
      const { width, height, mask, intensityValues } = props.ionImage
      if (x >= 0 && x < width
        && y >= 0 && y < height
        && mask[y * width + x] !== 0) {
        return intensityValues[y * width + x]
      }
    }
    return null
  })
  const pixelIntensityStyle = computed(() => {
    if (props.showPixelIntensity
      && props.ionImage != null
      && cursorPixelPos.value != null
      && cursorOverPixelIntensity.value != null) {
      const baseX = props.width / 2 + (props.xOffset - props.ionImage.width / 2) * zoomX.value
      const baseY = props.height / 2 + (props.yOffset - props.ionImage.height / 2) * zoomY.value
      const [cursorX, cursorY] = cursorPixelPos.value
      return {
        left: (baseX + cursorX * zoomX.value - 0.5) + 'px',
        top: (baseY + cursorY * zoomY.value - 0.5) + 'px',
        width: `${zoomX.value - 0.5}px`,
        height: `${zoomY.value - 0.5}px`,
      }
    } else {
      return null
    }
  })

  const updatePixelIntensity = throttle(() => {
    // WORKAROUND: el-tooltip and el-popover don't correctly open if they're mounted in an already-visible state
    // Calling updatePopper causes it to refresh its visibility
    if (pixelIntensityTooltipRef.value != null) {
      pixelIntensityTooltipRef.value.updatePopper()
    }
  })
  watch(pixelIntensityStyle, () => {
    Vue.nextTick(updatePixelIntensity)
  })

  const movePixelIntensity = (clientX: number | null, clientY: number | null) => {
    if (imageLoaderRef.value != null && props.ionImage != null && clientX != null && clientY != null) {
      const rect = imageLoaderRef.value.getBoundingClientRect()
      const { width = 0, height = 0 } = props.ionImage
      // Includes a 2px offset up and left so that the selected pixel is less obscured by the mouse cursor
      const x = Math.floor((clientX - (rect.left + rect.right) / 2 - 2)
        / zoomX.value - props.xOffset + width / 2)
      const y = Math.floor((clientY - (rect.top + rect.bottom) / 2 - 2)
        / zoomY.value - props.yOffset + height / 2)

      cursorPixelPos.value = [x, y]
    } else {
      cursorPixelPos.value = null
    }
  }

  const renderPixelIntensity = () => pixelIntensityStyle.value != null
    ? <div>
      <el-tooltip
        ref="pixelIntensityTooltip"
        manual={true}
        value={true}
        content={(cursorOverPixelIntensity.value || 0).toExponential(2)}
        popper-class="pointer-events-none"
        placement="top"
      >
        <div
          style={pixelIntensityStyle.value}
          class="absolute block border-solid border-red z-30 pointer-events-none"
        />
      </el-tooltip>
    </div>
    : null
  return {
    movePixelIntensity,
    renderPixelIntensity,
  }
}

const usePanAndZoom = (
  props: Props,
  imageLoaderRef: Ref<ReferenceObject | null>,
  emit: (event: string, ...args: any[]) => void,
) => {
  const state = reactive({
    dragStartX: 0,
    dragStartY: 0,
    dragXOffset: 0,
    dragYOffset: 0,
  })
  const zoomX = computed(() => props.zoom)
  const zoomY = computed(() => props.zoom / props.pixelAspectRatio)
  const viewBoxStyle = computed(() => {
    const isLCMS = false
    if (!isLCMS) {
      const ionImageWidth = (props.ionImage != null ? props.ionImage.width : props.width)
      const ionImageHeight = (props.ionImage != null ? props.ionImage.height : props.height)
      const x = props.width / 2 + (props.xOffset - ionImageWidth / 2) * zoomX.value
      const y = props.height / 2 + (props.yOffset - ionImageHeight / 2) * zoomY.value
      return {
        left: 0,
        top: 0,
        width: props.width + 'px',
        height: props.height + 'px',
        transformOrigin: '0 0',
        transform: `translate(${x}px, ${y}px) scale(${zoomX.value}, ${zoomY.value})`,
      }
    } else {
      // LC-MS data (1 x number of time points)
      return {
        width: props.width + 'px',
        height: props.height + 'px',
      }
    }
  })

  const handleZoom = (sY: number, clientX: number, clientY: number) => {
    if (imageLoaderRef.value != null) {
      const newZoomX = Math.max(props.minZoom, Math.min(props.maxZoom, props.zoom - props.zoom * sY / 10.0))
      const newZoomY = newZoomX / props.pixelAspectRatio
      const rect = imageLoaderRef.value.getBoundingClientRect()

      // Adjust the offsets so that the pixel under the mouse stays still while the image expands around it
      const mouseXOffset = (clientX - (rect.left + rect.right) / 2) / zoomX.value
      const mouseYOffset = (clientY - (rect.top + rect.bottom) / 2) / zoomY.value
      const xOffset = props.xOffset + mouseXOffset * (zoomX.value / newZoomX - 1)
      const yOffset = props.yOffset + mouseYOffset * (zoomY.value / newZoomY - 1)

      emit('move', { zoom: newZoomX, xOffset, yOffset })
    }
  }

  const handlePanStart = (event: MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault()
      state.dragStartX = event.clientX
      state.dragStartY = event.clientY
      state.dragXOffset = props.xOffset
      state.dragYOffset = props.yOffset
      document.addEventListener('mouseup', handlePanEnd)
      document.addEventListener('mousemove', handlePan)
    }
  }

  const handlePanEnd = (event: MouseEvent) => {
    const xOffset = state.dragXOffset + (event.clientX - state.dragStartX) / zoomX.value
    const yOffset = state.dragYOffset + (event.clientY - state.dragStartY) / zoomY.value
    emit('move', { zoom: props.zoom, xOffset, yOffset })
    document.removeEventListener('mouseup', handlePanEnd)
    document.removeEventListener('mousemove', handlePan)
    state.dragStartX = 0
    state.dragStartY = 0
  }

  const handlePan = (event: MouseEvent) => {
    if (state.dragStartX === null) {
      return
    }

    const xOffset = state.dragXOffset + (event.clientX - state.dragStartX) / zoomX.value
    const yOffset = state.dragYOffset + (event.clientY - state.dragStartY) / zoomY.value
    emit('move', { zoom: props.zoom, xOffset, yOffset })
  }
  return { viewBoxStyle, handleZoom, handlePanStart }
}

const useBufferedOpticalImage = (props: Props) => {
  const opticalImageStyle = computed(() => ({
    transform: (props.opticalTransform ? formatMatrix3d(props.opticalTransform) : ''),
  }))
  const opticalImageUrl = computed(() => props.opticalSrc ? (config.imageStorage || '') + props.opticalSrc : null)

  const state = reactive({
    // Cache the last loaded optical image so that it doesn't flicker when changing zoom levels
    loadedOpticalImageUrl: props.opticalSrc ? (config.imageStorage || '') + props.opticalSrc : null,
    loadedOpticalImageStyle: {
      transform: (props.opticalTransform ? formatMatrix3d(props.opticalTransform) : ''),
    },
  })
  const onOpticalImageLoaded = () => {
    state.loadedOpticalImageUrl = opticalImageUrl.value
    state.loadedOpticalImageStyle = opticalImageStyle.value
  }
  // The key for the currently loaded image can shift between the two img virtual-DOM nodes, which causes
  // Vue to transfer the real DOM node from one virtual-DOM node to the other. This allows the following code to
  // seamlessly switch between zoom levels that have different images and different transforms.
  // Always test against IE11 when touching this code - IE11's @load event doesn't always fire on img elements.
  const renderOpticalImage = () => (
    <div>
      {props.ionImage
      && opticalImageUrl.value
      && <img
        key={state.loadedOpticalImageUrl}
        src={state.loadedOpticalImageUrl}
        class="absolute top-0 left-0 -z-10 origin-top-left"
        style={state.loadedOpticalImageStyle}
      />}

      {props.ionImage
      && opticalImageUrl.value
      && state.loadedOpticalImageUrl !== opticalImageUrl.value
      && <img
        key={opticalImageUrl.value}
        src={opticalImageUrl.value}
        class="absolute top-0 left-0 -z-20 origin-top-left opacity-1"
        style={opticalImageStyle.value}
        onLoad={onOpticalImageLoaded}
      />}
    </div>)
  return { renderOpticalImage }
}

const useIonImageView = (props: Props) => {
  const cmap = computed(() => createColormap(props.colormap, props.opacityMode, props.annotImageOpacity))
  const ionImageDataUri = computed(() => props.ionImage && renderIonImage(props.ionImage, cmap.value))
  const renderIonImageView = () => (props.ionImage
    && <img
      src={ionImageDataUri.value}
      class="absolute top-0 left-0 z-10 origin-top-left select-none pixelated"
      style={{
        transform: (props.ionImageTransform ? formatMatrix3d(props.ionImageTransform) : ''),
      }}
    />)
  return { renderIonImageView }
}

export default defineComponent<Props>({
  props: {
    ionImage: Object,
    isLoading: { type: Boolean, default: false },
    // width & height of HTML element
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    // zoom factor where 1.0 means 1 ion image pixel per browser pixel
    zoom: { type: Number, required: true },
    minZoom: { type: Number, default: 0.1 },
    maxZoom: { type: Number, default: 10 },
    // x & y coordinates to offset the center of the image in ion image pixel units. As long as these remain constant
    // the ion image pixel at the center will stay in the same place regardless of zoom level.
    // xOffset=0, yOffset=0 will center the ion image.
    xOffset: { type: Number, required: true },
    yOffset: { type: Number, required: true },
    colormap: { type: String, default: 'Viridis' },
    opticalSrc: { type: String, default: null },
    annotImageOpacity: { type: Number, default: 0.5 },
    opacityMode: { type: String, default: 'constant' },

    // 3x3 matrix mapping ion-image pixel coordinates into new ion-image pixel coordinates independent from
    // zoom/offset props, e.g. This ionImageTransform:
    // [[1, 0, 5],
    //  [0, 1, 3],
    //  [0, 0, 1]]
    // will mean that the pixel in the viewer that previously showed ion image pixel (10, 10) will now show
    // pixel (5, 7) because the ion image has moved (+5, +3) from its original position.
    ionImageTransform: { type: Array },
    opticalTransform: { type: Array },
    scrollBlock: { type: Boolean, default: false },
    pixelSizeX: { type: Number, default: 0 },
    pixelSizeY: { type: Number, default: 0 },
    pixelAspectRatio: { type: Number, default: 1 },
    scaleBarColor: { type: String, default: null },
    showPixelIntensity: { type: Boolean, default: false },
  },
  setup(props: Props, { emit }: SetupContext) {
    const imageLoaderRef = templateRef<ReferenceObject>('imageLoader')
    const { showScrollBlock, renderScrollBlock } = useScrollBlock()
    const { renderScaleBar } = useScaleBar(props)

    const { renderPixelIntensity, movePixelIntensity } = usePixelIntensityDisplay(props, imageLoaderRef)
    const { viewBoxStyle, handleZoom, handlePanStart } = usePanAndZoom(props, imageLoaderRef, emit)
    const { renderIonImageView } = useIonImageView(props)
    const { renderOpticalImage } = useBufferedOpticalImage(props)

    const onWheel = (event: WheelEventCompat) => {
      // TODO: add pinch event handler for mobile devices
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        handleZoom(scrollDistance(event), event.clientX, event.clientY)

        Vue.nextTick(() => {
          movePixelIntensity(event.clientX, event.clientY)
        })
      } else {
        showScrollBlock()
      }
    }

    return () => (
      <div
        ref="imageLoader"
        v-loading={props.isLoading}
        class="relative overflow-hidden"
        style={{ width: props.width + 'px', height: props.height + 'px' }}
        onwheel={onWheel}
        onmousedown={handlePanStart}
        onmousemove={({ clientX, clientY }: MouseEvent) => movePixelIntensity(clientX, clientY)}
        onmouseleave={() => movePixelIntensity(null, null)}
      >
        <div style={viewBoxStyle.value}>

          {renderIonImageView()}
          {renderOpticalImage()}
        </div>

        {renderPixelIntensity()}

        {renderScaleBar()}

        {props.scrollBlock && renderScrollBlock()}

      </div>
    )
  },
})