import { onRequestDelete as __cukcuk_api___path___js_onRequestDelete } from "E:\\DMT\\WEBAPP\\kg-cashier\\functions\\cukcuk-api\\[[path]].js"
import { onRequestGet as __cukcuk_api___path___js_onRequestGet } from "E:\\DMT\\WEBAPP\\kg-cashier\\functions\\cukcuk-api\\[[path]].js"
import { onRequestOptions as __cukcuk_api___path___js_onRequestOptions } from "E:\\DMT\\WEBAPP\\kg-cashier\\functions\\cukcuk-api\\[[path]].js"
import { onRequestPost as __cukcuk_api___path___js_onRequestPost } from "E:\\DMT\\WEBAPP\\kg-cashier\\functions\\cukcuk-api\\[[path]].js"
import { onRequestPut as __cukcuk_api___path___js_onRequestPut } from "E:\\DMT\\WEBAPP\\kg-cashier\\functions\\cukcuk-api\\[[path]].js"

export const routes = [
    {
      routePath: "/cukcuk-api/:path*",
      mountPath: "/cukcuk-api",
      method: "DELETE",
      middlewares: [],
      modules: [__cukcuk_api___path___js_onRequestDelete],
    },
  {
      routePath: "/cukcuk-api/:path*",
      mountPath: "/cukcuk-api",
      method: "GET",
      middlewares: [],
      modules: [__cukcuk_api___path___js_onRequestGet],
    },
  {
      routePath: "/cukcuk-api/:path*",
      mountPath: "/cukcuk-api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__cukcuk_api___path___js_onRequestOptions],
    },
  {
      routePath: "/cukcuk-api/:path*",
      mountPath: "/cukcuk-api",
      method: "POST",
      middlewares: [],
      modules: [__cukcuk_api___path___js_onRequestPost],
    },
  {
      routePath: "/cukcuk-api/:path*",
      mountPath: "/cukcuk-api",
      method: "PUT",
      middlewares: [],
      modules: [__cukcuk_api___path___js_onRequestPut],
    },
  ]