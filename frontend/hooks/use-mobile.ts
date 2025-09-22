import * as React from "react"

const MOBILE_BREAKPOINT = 768 // breakpoint for mobile devices in pixels

// Detect if screen is mobile
export function useIsMobile() {

  // State to track if the device is mobile
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  // Set up a media query listener to update isMobile state on window resize
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Event listener for media query changes
    mql.addEventListener("change", onChange)

    // Initial check
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    // cleanup listener on unmount
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
