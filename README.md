# Rest Strapi v4 Provider For React-Admin

Rest Strapi v4 Provider for [React Admin](https://marmelab.com/react-admin/). For Strapi v3 try [ra-strapi-rest](https://github.com/nazirov91/ra-strapi-rest).

# Installation

```
npm i ra-strapi-v4-rest
```

# Usage

```js
import * as React from "react";
import { Admin, Resource } from "react-admin";
import { strapiRestProvider } from "ra-strapi-v4-rest";

import { PostList } from "./posts";

const App = () => (
  <Admin dataProvider={strapiRestProvider("http://path.to.my.api/")}>
    <Resource name="posts" list={PostList} />
  </Admin>
);
```

# License

This data provider is licensed under the MIT License.
