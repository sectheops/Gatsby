import React from "react"
import { useEffect } from "react"
import { StaticQueryContext } from "gatsby"
import { reactDOMUtils } from "../react-dom-utils"
import { FireCallbackInEffect } from "./components/fire-callback-in-effect"
import { VALID_NODE_NAMES } from "./constants"
import {
  headExportValidator,
  filterHeadProps,
  warnForInvalidTags,
} from "./utils"

const hiddenRoot = document.createElement(`div`)

const removePrevHeadElements = () => {
  const prevHeadNodes = [...document.querySelectorAll(`[data-gatsby-head]`)]
  prevHeadNodes.forEach(e => e.remove())
}

const removePrevHtmlAttributes = () => {
  htmlAttributesList.forEach(attributeName => {
    const elementTag = document.getElementsByTagName(`html`)[0]
    elementTag.removeAttribute(attributeName)
  })
}

const htmlAttributesList = new Set()

const updateAttribute = (tagName, attributeName, attributeValue) => {
  const elementTag = document.getElementsByTagName(tagName)[0]

  if (!elementTag) {
    return
  }

  elementTag.setAttribute(attributeName, attributeValue)
  htmlAttributesList.add(attributeName)
}

const onHeadRendered = () => {
  const validHeadNodes = []

  removePrevHeadElements()
  removePrevHtmlAttributes()

  for (const node of hiddenRoot.childNodes) {
    const nodeName = node.nodeName.toLowerCase()

    if (!VALID_NODE_NAMES.includes(nodeName)) {
      warnForInvalidTags(nodeName)
    } else {
      if (nodeName === `html`) {
        for (const attribute of node.attributes) {
          updateAttribute(`html`, attribute.name, attribute.value)
        }
      } else {
        const clonedNode = node.cloneNode(true)
        clonedNode.setAttribute(`data-gatsby-head`, true)
        validHeadNodes.push(clonedNode)
      }
    }
  }

  document.head.append(...validHeadNodes)
}

if (process.env.BUILD_STAGE === `develop`) {
  // We set up observer to be able to regenerate <head> after react-refresh
  // updates our hidden element.
  const observer = new MutationObserver(onHeadRendered)
  observer.observe(hiddenRoot, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  })
}

export function headHandlerForBrowser({
  pageComponent,
  staticQueryResults,
  pageComponentProps,
}) {
  useEffect(() => {
    if (pageComponent?.Head) {
      headExportValidator(pageComponent.Head)

      const { render } = reactDOMUtils()

      const Head = pageComponent.Head

      render(
        // just a hack to call the callback after react has done first render
        // Note: In dev, we call onHeadRendered twice( in FireCallbackInEffect and after mutualution observer dectects initail render into hiddenRoot) this is for hot reloading
        // In Prod we only call onHeadRendered in FireCallbackInEffect to render to head
        <FireCallbackInEffect callback={onHeadRendered}>
          <StaticQueryContext.Provider value={staticQueryResults}>
            <Head {...filterHeadProps(pageComponentProps)} />
          </StaticQueryContext.Provider>
        </FireCallbackInEffect>,
        hiddenRoot
      )
    }

    return () => {
      removePrevHeadElements()
      removePrevHtmlAttributes()
    }
  })
}
