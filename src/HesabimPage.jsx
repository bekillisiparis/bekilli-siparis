// ══════════════════════════════════════════════════════════════════════
// Bekilli Group — Portal v5: HesabimPage
// 3 tab: Faturalar (açık/kapanan/iade) · Ödeme & Tahsilat · Log
// Dinamik bakiye hero rengi (ödeme oranına göre)
// Portrait: 3-tab + subtab | Landscape: sol sabit + sağ scroll
// ══════════════════════════════════════════════════════════════════════
import { useState, useCallback, useEffect, useMemo } from 'react';

const API = '/api/siparis';
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtD = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';
const fmtDLong = (d) => d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const BEKILLI_LOGO_PDF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALAAAABYCAYAAABVoH2xAAAs9klEQVR42u19eZgUxfn/563qnnsPdgERkEPwAhMP0BgC7uKZoBEUZ+Ot0YiJJjGJmKiJzk6+akRNTGKISuIVAupOxJ+JN+juRo0nalTwAkGuxV3Ya46e6e6q9/fHzMCw7C4LgkKc93ma5Znprqmu+tRb713AHkwcgeD6KoMZhCIVqUhFKtLnwXlzHDe5+LLBzjsTT+aW/1dS+HmRirT7ghcgZhA3PR1MPDNyCb9Zzsn6sQ8BAswQxRH6cpHYIxFM4OT7M0rYaR6BNkep5Mr9AJ37tkhFAO8JOLY3aDBsCCEJyBSnsgjgPZEo929R9i0CuEhF+h8AMEciguthZK+ijbVIuzcZW4IXgqJRjWhWIwIas58ziKioIBVpNwZwFrzQbS9dPiKIxunMPEx6Brzy/LiFdUTkFkFcpN0WwFwXllQTU4mXTpritR+eb4iOMigGsApHNYyZwa11U1FbE+ecCas4bEXabWRgZhDCMd3y3qwS7nhjjnA2lMU72I4n4MY3ZjI+/5qq1H9vuJaipNEAWRyyIu1WAG5oqJJE4FD8la8FffaQhCUUETxEMCCkqRJKs/3pCYAATYZbHLIi7VYiRHXuP9qxQkRgKrQ5MENrEqzdILPrISK7OGR7LjEz1dbWbprhaDTK2AO8l731e5MSJ01WcLuazIiUckFmeT8AAQA2MxMRFeXgPZBy88b/S/3eBGCluBd7r9Yoxhns0dgFwH/7298GWpZVkkwmORgMUiAQaDn33HM789/vrv2+++67B7iuW5rvN4ANl1xySQcAMopz+79PVVVVsrGx0a2vb7h5/acbz9HKTZsej6+0pPSHAO7Mf7+79vv5F16+obm5+ULlZvtdEiq5AsAfqqqq5K4DMDMxgLzssqfIW//LlEikKJFIkNZKmLZNhtwz+JdlWZRIJEiprftt7FzMMlVXV8vGxkYNIp2TSQpBK6qqqkRDQ4P6AuRoikQifXaLb8+Ci0QinymmJBqN6m0oLXpH+1H4rBBGwOv1Csex/V6vD1JKz7bGqba2lnd0rrr2p6/vsVWHBPm9Xq+w7Wy/hSDvpu+4vsqgyY1u8qUTTwnYrz8aj1uKSMg8EzWlQ8ocvDF47PJRRNTRgxJH4XBYxGIxlRO6sW7duuCsWbNKKyoqKtra0u0zZ17WNmTIkFT+gXA4LPP3b98iyXoE408HB8LBh6GQKEsk9SslJyWP2gXeQhEOhykWi+0JOoAAoHuTJadN+85BLS3r97K11h6PRwweWPFRLBZbu7vLwOFw+IB165r3zve7f3lo+aOPPrp6Z8nABIBjsZi6+eabB73xxn/PSGcyJ1944YyD0hm7TAgKMrP13e/O2PjtU059u7ys3+NHHnnYQz/60Y82AiDOom6XD95dd90V+Oijj/ZOJl1WSnXLiaWU7PUCw4cP19OmTVs/cuTIdCwW2+I9uz5TV1fnef75V/fJZLYvJFlKyYahiCjg/OEPN60uHINIJDK4tbXV77qSlVLU1rZ+dSwWs3vjdNFoVEcikWFNTa1mICDZsiytlAr+5S9/eY+INACcfPLxa1S7aokjDgCIx+Pt2LxLEgC+5ZZbgqtWfTrIdZNsGEEaPnxQx8yZMzdsL8gjkYhYv759mMejZSYDDBhQ6l5//fWrtnOuOcfs1q5a1bYxHo9j8OAS7L///u2PPvooAPBnAnB+4JjZPOus865auKj+x0rp/q6roLXKskNmAOR3yBmase2hyWRqyhNPtvzqjLPOuaHuwfmziWhTO7sCuHlOv2zZiuolSz/6p2WlFBFJykOyy3CRELxk6Yf6yScXNU07NbykckDlvL/d+9f5juNy4STm+/zRRx/tv/zjj95KJZMgIXJmn76setIgEj6vbwWAgwC4AISUQq9Y8cn8NWvXTwRYgVkKYXwFwHvdjdOMGTPMaDTqnHPO+We89vpb91mWRczMgUDAO3LEiNsAXDlu3Dhz8eLFzquvLp698pNPznVdZUspPVrhWwCeCofDsrm5mRobG90331xyYmvrhrqMbWdM0/S6bvpOAD/cDkWPAPDChQuDPn/oP0RioFIuWtsGrANwAACrr6bYqqoqo7Gx0V20qOH3Kz/55CLHcTJer9dbWdFvKoB/VlVVGeKzgvfqq68ecOppNfXNLS2/tqx0f9t2XGadl3GZiPLxE1opV9m248bjib1bmjf8aeq005+46655/XPcY5fGJjuOQ47jSNu2DcdxZMa2pWVlKJ3OiHQ6Q+l0htKZDFmWJZPJpGGlreFtbW1TPlnxybxTTpn+7O23316Zl08L21VKZdt1HJn/u6m9Xi4rnaF0Ok2WZW313rbtStu2pW3bRra9dLdLYty4ceacOXOcb3972tS165r+1tHR6bFtRwgS3oEDBvzxzjv/9LNCoNi2Q5mMDdu2ybZtdLdruK5Ldm6csn1wdjh8IJMba9vOtrfDc6dcytib+62U+qxKXEREo1G+8cbbKxv//fQz6UzmUOW6DhEZPbRJWdGYNonemUzGbW9v/9Y//xV75tZbbz1h5syZG7chx+0Ug3h+YXk8HvJ6vSInwuRFGTAzXNclx3GgtXbS6TSUUsc89cyi+cz8zZxyxd20S0RgQ0jyhUL5dntTeIUQAlLIYM/9JA0wMffInZxvf3va1GTK+ofruoIIrsfjNYMB7y/uu++vNwOQAFQoFBK5nYFzbets+9zLOAmd/bvjsrHI/Q4RQQixw/NKyPdb6K6ce7sBXFtbS+HwUqqrY5p6avgh27YP1Uo5RGT2IsfQ1mNEpuM4TjKZOqyh8cUYMx9XU1ODWCy2KxUKIiIlhJDDhg9beMBB+//OsizpEWZO+RSUSiWxYsWKQYlk6sJEIjHRcRztOI6TtsQJZ5993rHz589dFA6HZZc+UnbhCREMhd75xoQJP89k0sIwDN27HGxASrYAqJ7mrZuxw7hx48zGxkZn2rTpUzvjiX84jiOYWfl8PtPr8131r389cnMO4KonZtJdu3357R3Qj/LGqJ3Q1tZ92hEOLGKxmHvmmef8JJVMHes4TnfgZWYogOXmySVNtOXvEZHpuo5jWVb19PB3frLgH7Hf7qh1YjtMfSyEhBC08pqf//ypnu4zTfPeb37r5Mc7O+NTlFKOZmbbdY4DsKi5uZnGjBnTdZGxEAKuUs3XXNNzu93RL37xiz7fm5dnzzvvwlPWNTXlwKuVz+c3+5X3uyoWmz+rALz/83b37QZwNBpVN954Y+Vz9S9cm05bOic2bGUPNk3TEFmlRgMQWmvhOA5Tl32ViAzbtnV7e+fVV1111X033XRT6+di1mH21NXVyXvued4ouXCSixgQDgOxWAzNzc1mY2OjrYG/GoYxRSkFMMNjmKV9aNesq6uTs2YtEvv+4rieOXDB7/V1wb7yyivm4sWLM2efd+EpTevXP5xOZwSgld8fNPtXVlz9wANz8+D90kQN7ggH5nfeee98zboCILdLG8zM8Hg8KC8r+/2gQYMW+HzBDfF4+9CWDRvOiMfjF2UyGc5heLNArFkRUPnhhyvOBPCnz2MSGEyzZ88mAGTNfpsAYPbs7Hdr165lADrg9Qyzkqns/icE2a5+ty9tz549myyrhZpnf9DrtrlkSbXO2Zj7qjRnzjvvwlOa1jc9bFlpwcwqEAiYQ4cMufree+fc9GUD7w4BWAiBznh8uuu4TF3S2ZmZvV4vBg8dEp57390LCr56H8Ci8y+8eNHqT1b93bZtKgQxCSLXdTljp08TQvypsbFR7+oX93hMKzfZ3U24e9llP/3KsuXLrnQcRwHwSiHi+48e/ggAamxsVNXV1dTD+Dh9BVFjY2Of+qq18kSjUX3ppT+a+tGy5f+wrLRkhgqFQubIfUdcfeef//SlBO92Abijo0MAwF2/+91eDz721Fe0VkREYjN44ZqmaVRU9Lt77n13Lxg9erT3sMMOc8eMGcNLly6lJUuWyPvv+cuD006rmdje1n6Z67pugUwssuYo96uPPfZY6ZQpU3ZZhBQRCa01NrRsPPy002qu0JoFC9YSAkopYuZSIjrk/Q+WnmDbjk9rzYFAAEP3GXrpjTfe2FQgo3cFsNBaQSn3oHPOOX+21pqAnmydrL1er6isrHzu1ltnPdybHZyI0Nm5selnP/v58UuWLn3YsqxN1oZR+4669s9//sNNeaUOX0LqM4A7OzsJAN75eNV+RFSSl203A1hLKaXed+So2wGIww47zC2U7cLhMMLhsGhrS9ybTCQucxxbEom8hYKYmbXW/Z5//vlhAN6NRCKUi0fY2UqcYNZoaWk9wjSNI7b8Lqt9MmsopRiAKi8v7zxg//3Cv/vdLc9WVVUZsVjM7UXjhmWlB69d13TpNvoAj8cD27EFgIcbGhq6NR/mFpt16Lgjzn93yZLaVColsgm2LLRWWLtuzYHMLKqrqxm7rzt4l1KfnQdCJHITlNqrwDxWqIGTILHu+9+/6AMAW8l2sVhMR6NRHQxWrFFKJbpR5qC1Fk0bN3o+n1dnaK23uJizIQ8FtmGyLMu/dOn7v66pOfOM3Ba9zTFTSvXpYsDZBtA1EXmb1jbNSqVSfgAkpTQBCMdxVDJpnX3OeRdc39jY6FZVVckiB+6VA2f/tna2MXexrDMzSynJcZ0N++67b7obgG+iBQseT/Uf6LWkECHuxkKvXHcXc5GsYd3n865IWdarYCJschVk11S/8vJBtm3v4zjOvrZt+1zXneAqd8IZZ5w97qGH5l953XXXiZ7s3YZhdHq8nqVgEHpyAjCU6fHIoN+/HAAGDhzY2zuLdDqthBDS7/e5ew8a9PAnq1Z/x3VdsizLbf605eoZM37w3zlz7nioqMT1QqWlWQvS3gMG6I7WOAo9TUREWmt4TM9er732WmD8+PGpnra0srJSIthfYLUfVkJIY/iI4Qv/ctcdl3SLGCIorb3f+973j123runuRDLR37Is3drWPvPSS3+8KBqNPj1jxgyzy7avhZDS6/UufvrJfx2zPatwG2Y0FkJIwzCsAf0HhP8+977HTzv9O9bGja0XOI6jLMvSq1avuXvmzKvfu/XW37y9q+3oeyyAtdbZJDrDWMOsUajA5bmwZj1o3rx5+wH4b2F45e5IruN4q6qqDL/fLy3LUoWcMBaLMRE5AJ4499wLLsvYmYdt287Ytq3XNq07F8DTbW1t1D1zheDs4u2rW5x72y0AZq/Pmwr6A1Pnzbv/WQBm3UPzZ0yddvqY9vb2IwE4yWQy+P4H7/2jrq7uiJqamviXKW9RbAcHZgCYMGHCx0JQexcOSwApZqamppZpANDc3Lx711Qj4sbGRteyLNXY2Og2Nja6sVhM5RYdRyIREQ6HPYGA952czGRorYUA7SulxDbst7wdV69SsJRSlARD5z766MPPzpgxwwyHw5qInCPGH3p6MBhoZmYDgJNIJPeb/2BsnpRSV1dXS2Dn1bRjZjrggAOImXu9+vCbm+7rQ1s7F8BlZWUaAM4888xWj8ezREiJQg5DBOE4Dlrb2y649956X86VubsXBqREIlEYG5C/OBqNurFYzE6m7aOFEJSzFzMEMsyMcePGbSOWYLuuHudHKYVVq9a+HYlExN57761isZgKh8Py2muvXT1i+IgzfD4fM7NQruvEO+MnTZ/+nRt2plLHWXbOc+bMUfkgo56uPlhBVGEw0Tba2rkALtSwQ8HQE4aUYN4yXYiZleu4I558cs50ALw7a8aGlIqI+M0333By9TA4H60lpcT9999fefbZF5y/ft36WzK2zZRV0EgI8bzWGgMGDBA9IDefvaF2DhcGQqGgv9BOHIvFVFVVlXHHHbfXD+hf8TOv1ydBQDqdcVvb2q654IKLwjkQG58RvPB6fQYz+5jZn/vb2+Xp2YpFBMC/HW31ifnt0AuWl/ef37Jhw3UAe3LGetq8QzAr5moA83ZTpiuVcvHJJ6tPOfHEk1/mbIQTF5rzGOyZ/0DdMMdxKx3HAQEOgzyGYXQesN+ovwCgr33ta+qpp7aI2RFaa6RSqXGTjj7mZc6ZN3rDB4GIWVsejzj92Wef3dgTN1ZKbSWu5AH6wAPz/jDttPAhHe36u67rOOl0Wq9d13TfT3/60/dvu+22d3LB6ju0xl3XxYqVK86afvp3pmjm3gQmZRqGdJW7GMC0rouAiLi9vWPg9OlnvKuh+8BdCVrycY2NjR/sdABXVVUZc+b8YeXUqeFH2jvaz1BKOQDMnFipicgwTbN5d4NtTgl1AVbMhFQqNUAIMaAnzqO1BgCHiEzDMEyfz9cxYviwc2644YbVuXBKDWRTgwC4m50gXCKl/FrfxHCC67Jr23ZXzqWY4RJBMYOFEN1Oek5MkzffdMMPfvazK8d2xt0jAVjpdNr7wYcfP/j0008feeKJJybHjRuXixYklROF3KyxZesFlvvMze4gxB0dncGOjs5Qb34SZoZhGHBdd21XXTn7HsSZjC3Wf7p+SB+ZDNhgs6BThf2Whf3ebhHisssuY2bQgQeOing8HpuZzSzTZYUsl7JHDh86FwBVV1fr3YbvEnlM0zQMw/CapmGYpgdSym4vwzDh8/ng9/vNQMC/cUD/AfPGHHTwUXfeOfuxSCSyhXWFmQ3TNI1sm4ZhmiaREOjLJYRAd9F8APoV9rUXRsORSIT333//zNixh4YDgWCbYZp+KaW0bWfM7bPvePrKK2eVbO6rLjMM05BSBgzDNLTWnm4Wurfwt70+H3l9Pni9Xni9vh4vn88HKY1Nwfmu6xKAAbm2TI/HK7Pt9O0SQsiCMS7N9TtomqbBzN4d5sDhcFjn3Lwf/uCHl5+3euUnv0+mUoOICD6vsa5/v5IfzLrpN+/XRcZ4aqLRL7yWWj5ut7Jyr/ccpWbb6Qxzj6kSGkJIrFu3dl2/sn6dJSUlH44ff+ibF110UQuALXL3amtrORqNIhQKNQ0fNuz2TCYjILaPHwhBYKVtv99MPv/884hEIvzrX/8a++yzz1/Ly8sOdLWroUmYJrX8+9+LNv1mIUWjUR0Oh+WsWdFVl19xxTTHcmocx9bMzB6PL1A+gEYuXrz4bQAYMmRILBAKrrNt2zUNj5G2MstffPE5jBkzhseMGcONjY3Yb7/R73V2ts/OZDJag/r0QgKsDdMjbNde8cLzzwEADjroINvr9f2WSJa4evssegKAUpmWF+vrAQBD9t77Eb/fv9FOZ1yfz2uUl5d8AADV1dV6h9Pq85M5b95j/RYsmHtIRml+7P892pj1jgoAKnciVqGpDXzkkd8s9Xjt5UJQ/5x5ivLarsfjoSHDhxw+95573uwpwOVzTqvPk4xEIryrEk931iaDL2EsxA5rqflEzLPPPrkNQIMhJdwXx87MpDtPMA2ZUOY+j9OEF+7miCsQ/ez5JDvDlpmzj/aZBg4cyHV1dZqIVFfOVwicz2pt6er+zWcJd5F1twVOjkQiIhcYhO6e7WO7O/w+AwcO5ELx6rNYQfra7z7+AInuNOTa2iiPHRuWgz0nBg4JXP+4lCsn+eGCFMH0bjw1/uwB4+nY937ArAW+4MruBcrJ9j63zbWxs+MPdtSDmdsh9Gdsd6e9z85qp7d+b1PGycppVhLA1vJsA2RNTUwdUnbH90IlbZM6W9xMIi1UPEVuYkPGCXmavm+98q0TiaDr66uK1d2LtNNJbGvjlVKCnfZWIkoVcLIstYABCaGTJyDtahLCIEASwWAyhHYy7Ha8dw3IQMufG4uF/Yr0eQN4kwTR/X0DQNn4WZ3MBQ9ygSVPJlMMgzomZl476Ss1MSjag0+cYwblDxrfrfuZ9Sx9ac72+2y10arBgAaZJXO1NqczHLFlmpxQPq9tJDrenw7gHUF7HmjRAIkGaKKcbEkFn1dHNFHfLBMc6ZlZNACiuhqItYS5pmYHCh7WhSUQA9VA5a0+DBDqIVFd0Pft7CdFe36ur/dtGsfarRdVbCkofGnu82qoHbEgfSYAE0FFIhCBo1//Z/yZYf8N+jYeksqQIuROMyIi7ShAu99i5qgg4tJSl9J7wNHcdXWQRMh5gCSYXdlQS1RdyyDyuIDjAlFwHSTVYJugo6ipu2eMDMDViDKA2Kbz+vq8wAAQxVQ2INADfu4oA9W1IDrBxWTHzd0nAPSpyg5Fhc46VnPOuB7vIw14cve428CJYMDgghqCub8KKFivfR3LnceBAdRWQxCRG68/5D4pO25DWm/eZBnCtgFQcj+suqOcgbZg0KF0RnZn5oJhGBg8YPAXz3lzA7nh5SdKS/Gb81T602+mFg0dNf6IAKWeGYR0/T7Npjf0H8s45CE68u9v9uxijQiiqOYPrh+SWv/4PHCcGIbGFkFQWhvcvlZ6+61g/wGP0+EPv4Y+zCEzRJazmnDeOO5bnFhxunLThyWtNwP09HSknxvSKj2hV9k/ei7RPxcDetsnrpIHyRcn3RMQn45KqgEtwQnPnUNE6cL44uwCkzr5yomzArzmqJRTmg6MnnEu7X1ec9c45GwfSVsvf/PXPrGuKmVBQQMMMEkJcjuTQqj1hlnyerrs+H/Swbeu354FvFMAjOqIBqLwlA57Lr1xLQMpyRBMuRJbrgJLj1uWaKkfCqAt6Cra2Mtxc6bp2S3A2/HCcVP86R/8yUTbSFM6gIeAEgPQCUB1HABHTpLJpp+lGw6+xyo77aryQ6MduV1pK4BkrNagn5dXkdsOeGSWcW3xowTYG+G2r4sknh11V/CYDy4DiEFg6mZ1cCS7MDbUf29oqai/S3S8OkVIC6aXgYABsA2o9YArvp5pW/+jdONBdzcNe+zHRCPTvYKYTHB6zTHwfTAcqZEJZHua7k514tTaifC9O8FwBiNtWyUAmtG1blwsy8rcxPJxKPnkaK8NyCAAmXsrL2WZt9Nysadl3m86np98JU1quIcj3GcQ9xHAvbWVzRy2vKPXCPVSu2lQP8fFJi7MIEg4wm573bfby7w58HY+97XpfvutmLLjpAwTGbviQyUDC6W5V5ztDUEg83Vy28cHgp2mlfafZBCu67Vdg3UyLWyDpHQT/mVklr6hWQtAMDhDRJ59oeLjSCcoWJG+JFH/lc6SY+jnXMcSXbbU3HnWnPzPSUOk9Vi9SfHRymVYTrBVi5KF5Kn8WCtLkrK+JrmzCm6n8Hmsiwd9MuUg5rUnonZIuucTVxkE2QnLVCxkB3pxnjCMBCxT2a7IGEy6dxuAkYQlleV6FZIVzxLsdkAQK8tD0nuIBx2jlNtaURpaerf10jdX09efXNhXcaJvACaDtpWm4sgOx8vsbG1pIDArwFm/W5vRcnKitt46ZyRtWPQ3246zxxcixzPyt4FvvHYtkbCAj3Kv5EX6hcNPVrL9CvgnnV9yaLR585be85T7AiTjHfZTJcev/El+bHL7DqwXDz2GE8sedjqtEvCG73e+f8vNdODMDd1xTGaWiUX71gWMztGZDIGNAY9hrxMvCx3811XAx7m7vHAWn3ys6nj1/lRy46BAyZqJyfoTbgpF6cc8lmVPAi6DJcAS3PuprEQswLl7+4AgsJIQfhkaf/dl1K9qRdYAxmDW/vSLX7+GUu9fozOdpDLvXwOSC7FE9QkvoncsE7muAkTJIODFUKHisJkixAwqiWcGS0mVjup6hwYJH8z+x+/e7DcGIhKsN770S6+MB7weUzhi8J3+iW/NJCKL69ngJ0Z7uR4+vi5j+L7x0mPGUR9NDoyfs4rrq4w+afoMENhbH4Gx4l746iNscB1LjtiG/xuvPafNIQtNDySxUyJbHh+OLVEOrq8yKAptvXR8TcjbMcHOsNaicvFNx6ycGjh4ziqu1wbXI3vVZaQ57uFnqfKUb0kzlEp1OFq4LZemX/3uAVQDxbxr6zH3NAD2uifKuQ6SXz/M5Ho2iMjyT3z9Wpe975MAaSexP6/5c4Ci0H0xWYpYS87BoBLrMhkNFEQgETHZrtA+06qIv1B7CAOEOeO2RHosZhCBXeujbwcCtmQmRfkAHYClADlaplB+ZBMAJI1K3g25L1ENFLcsKNFOappjK86oYJtdcdY1HHEFc0TQZLg0ZVmGJiNN0bzanf1Dk7fPZVoN6BFB6GpAYwkYY5HT0LWRDW8isFm+dZstjQwIqOSKs7VtsfT4hfaPuS5KpPn1cSZNhrvpqoHid8d4vIfMfsemQXcHAqbwe9LSTb0xPWu7i4ovbMAHVNES374EVIHr4MlyYuokQQC0hDfdZ93MCIeznCMw7JSPE0ve6zBlpsxRtLnuGRELpIXIrPgNwZyESxY7XL+ZXdPkpXZ8+fy95MqfX5F2HAZJUcDAtdeETMO3LLD/L5sIv0JTU5M2vcHdzNYeISDK9op7RgvY/UyTKKOCr5V/9VdtXAcJRDVASDSOPzGo3xuZsqRWzAJaU4kPlOLQ+uAJny7oSzAYkWFnTWpsb05kEXBenXCK2/72sQpas/A3hUb+33LmRzYpRTlRQjErT+KZoQdCMiUzxobS4dUvMp4ijFu8NeCXjlUcWSoSvr3+5VhrLjdFmlinDwcE0KK/AEZC0BXj2mnsLLfwM+ulquMRf2e8drUiI9iEyh/HmS/vU2ShQQTmCAQN+3lrYuGwN3wyWe1Y0MjZcgmQKUvoUPDTiemGYfO9Iy67gkbMbMpXlkq/femBYm3tPMFtg5Ku1IIKxBLNLL0S7JY+k03kA0477ezSRc8+FUqn01sFyhARPB7z8+cMsaWUFXZ8lR5TiKxN1W1idgkNRIhBAEJJVlej0q0KxHVW+MoQECBwGy0BaEFWT+hp0EmmUxos/dOSjfvtD1YECDC0ZGdjf+7876EekYQIlEGq/X9Jex2c6FaRWTfHALs+IQlSYQP2/UWccBUzdcMRlsSYotAdR765Js2OMoNkAG6wd4yJ3JKhnQ5e1g6rZbOnxxu+8gmIhCQyofUEjv/3bHaTJPoFJKnhs3MF8yXQVyWuukog2qjh33s+dOtkaJdR4DYjgkgkWZeEPj3T+ujmExMLRz3LKr0S0jjAbXrweJ+0/Mk0bQleAIK0SGcCyqz86r3AO2AGVq9e2Q9gf9cS/ERErus6tp3sBNBt8PauJim5zXaZDYOJ2bMPkcHMedmWwd7KtxEfNDBlwWVIg532fUJuygdQW19m0HUJAX98mPC+Oyzv0kOKoIlg2cL2BgautNzR14eObpibUwq3nsDBMxxaEk1pl8GQg9H0x0pmbEA++rqQxoaJIzGRrjh8uJF63QCnmUAbAc6FAXQjpCtHQxCgnYKEU+oictmUbDicNztitimjEYQA6aQKOq/fssmMRgDMXA6sN4BkZsSfSia//FeO9PDuPSpx1Y2KGRQcedX8RLp0tc/LkruYRohIxJNQ5HZWBM114VCg/cqQ0XwKqZQ/1Q14NcMNhki4ov8C3+EPLK2LjPEAQDzeflDWjEOFafe5w2BEfNSoUS2fOwcOZ2s8mCPDy7Q222xHs4HkeG66d2DuBgI0/Ec9czkmrDg4cOyKQ4PHLjucvAM+hakN7lvmAhsmI2UHPk5a+y1IWqMWJKzRTyZsP9uOdgxfedze995jQkfXz+U6JbsqhURgroMkEg7Du0QIwQHTKk18+MBkIjCWjN36iIcxMUlRaDfVdJokGxAmsQy90h3o6uogoTOASn4KYQIq6et874deZogt3MBjQUSSObPRCynBKtNuqdbWrFdrW8UYBRJOmZ3IlGcSdnkmmQ51WlbZh8oYuSATmHRSqPqtH113nbNdjoxNh38gBkFDTkmJ0H6Xm14vCVKKu2TVEiAdJTiRJDfeyW48RUqxYOoCXmbSHkOJtFOWCA056RfMmpYszX6XSCQnZxMmt2ibiQimIVdfcMEFHdjiQJjPQTLLg6PiOx0wg495vAZ5RbI0+d4NtVnRJ6a4DhIxEqglkf3Ml84V+MaWnrUe8at8AQFSmX+FJi+ZHpr83vSSYz6YQr59bvcFTFOqtkpedtntzEzdc0dkS7qDIfz7/A2Gl2w7o0y15jed78/rTwcvtevqILkeRn0EBkcg6GDYqcUXft3D68/PZBydyvgSorx6QU6T3ILDhXOBWWT2WwFNHPA4/UTrkm8SQWNwtl2+CybVQCXfvHyIFNZhcFmTEVjTb99fdPbuICEGK0CGpDni+6caB0THGAdGDg4eeOUY/7HrvmJM/GC674hHn+CIFtHo9h3ys9niUAPFDBmc8Nwjne7QWcEKj0msXM1dQJyVtQwiZEMnu+wvmkkL4bLP7xeu58CL6cDfrkAsLKKxpU59fb0vkUxMcV0XhaBnhhZCss/nf5OI8vUkPl8lIxxhZiZzwNE3ZnRJJp2xtXSbvm/9e+xtHUtvr6QaoaiGFEWFC/LCeWP6cQYnKrWCArS3j1YkMJSX67TkeuXjiGO8X/LWzKRd8SpYIWg0n5po+PpPaDJcrt86m4EopjgCEZjY+Eg806/B5yPJTttIT9O1z6ZenT6hpsZUNJncyVFyUctIv3rCdGp/+l/Kjpu+Mr9Q5qD/Cx5229osJ+8yvi1hBhjCUzEfwkd2JuMa6fduSb122jfoEtOhyXDpEuHw0p/sTW2P/J10KgSPR5A5YAERMRog+8ApyKux3D/8oo/9wy5eRsOuWEtENtcpyXVhSdHtP6HK6Kokch0kHffBVanGrwZDZct+mIrbUFq4IJLUS2ZQtiIQK5/HNUxfEHFnr4tLj3vuQWbI6upmAsBz5z54hlJ6GDMrIpKFDFhKQaGykoVflB2CKKq5DtJXc88H8cYJ5/vlRw9qOw7prPwJr7kxnFg06kX49m5ju91LbvtYu/mpIyRSEOVeEAdXZ7fQHvLSPDKfDSKYSVENFNeDUAs9nki3v37eWUb7wrdUstVnmh9dn3hhSj1NfOKtHr1RRJBvXnNOpuPBBp9v/Wg7s+6r2u78d/yZIS8Lw7tUu45MLBo+zkuJQ9hNwlPmRyo96L6SyW/dwnUkUdNNLeKa7OKgiS/WxxcOj4VK0uFEe8cgoV9oTC4c8pxm/TFIDkiteXCi0J0DfV5GKl2+NPjVC/7I/Dr1qnARKXC29IAtbF/OBi1QC43aKGfl3dgOzZvoIiIw1UDxdbYIHP3Gj1I85lLDV9JRUgrDIJey6fPZXP/CS2vWHsOl0nIyyNt/jSUPnVp63NK/1kdgELFubGzkDz/80Lu2ad2vujnohQFIItF5yMEHPQNsynn6/EFcA8V1kCVV/3koaR5xMjwDPxDSgN/fPiQYXFMTNBZfEgosuyAYajkiEHABo2RDyhry6+RePzmPWRNqu981yHKMkF8EUEoGCCUFONRcX2WUj//bcsd30A+8pSWGN2gFhPXms6lXp+6D8NbGfIpC10ZAwcNuXGuHzv26Q3vPh1GCoM+SoeCn3wgE1lwcKl1/YcjffIhp2IBZ1prhA34VPGb5d1FLhDA09bS71YI5okRo+Ennpp3BdaGSEAU8cRkIfnp8qHTDJaHg+tMCvo6BvoAXjhi6mAJVU2ivHyZQ23uQEDGXoYyMklJhgDwiF4KqKRrVnzUJl7YVF2C9/L2RhvviFSrTcZZXpvpBZE/sKeQG0CYy2r+WfIPm2gMvv61k9HnNuef1uHHjjMWLFzvh8Bl3btjYeonjOFtwX2a4hiGNQDB0/xOPPXLBtsqDfh5Zyfl3X7uWA4Objjs1k1pzvHLSo1jZXim9rjR9K+Cp/I9desSC0JjfN/Xc16z7nd//Wf/4inlXlQTjMt4hXiz9duIfha7n7P+Fji8c9WOPWj3CYxqepBz9eKj6rSd7clFvjtqSsN84fQIn3z1FOdY4rdNlAgbIE2iSZtm/Hd+hDwYPu2stZ+sVg7Yhmm0eQxPWS5OPF+7qaUo5Y5TSQUMIm4RcbvgHPfn+EQ0LDiayexvzbB9JJ+oPuiDIyw+JO5WQwy6+JXhQdN3OqqBJfZlIQIBX/HFQprnu62x3jNdOZhhUApABV5re5d7g0MUY8X//oYrxHfnnapdEOBqNCgBu+DtnXt66se33mYztdj0rTmutAoGAHH3g6CPv+OMfX9sdALzlu+eHycDmUxUU8gFOXAeJMD4zJ9mRvucDxTfLjkbBtOpNu/r2xtlmPd6FAT9mAVScTVLSLixjsBPdrBGIrDdq27jn+iojEqky8unURISamrOuPva4b/LESZPdSUcfoycdfQznr4mTJrvVk4/nk0859WEhBHIlm7Y9aQDiTwcHxh8LtnNDCccfD77cfZzGZ3cxM4dlfQQG58/yAIjrILm+yujr7zFAm2IUuOfMjPr8PfVZK0LfF1tYFjxDAChvkYhEIHZ8EYcL29j87hyW2zPWnOtL7v136hxt0+ecX93ZaoE1Ag0xagCjpWGMSCIpAKCz1eQX1i9zC2MCfvrTq0Z//PGyWRtbW09LZzJK0Fap+dm8ftNMjhw+6uda6+5Ov/xCKctdttwNCEA2xLGx7+0AjMnbTumfPBk7lIZO3aQh1WxnZkNf2t387rHtbAe7TKcx+j6ZlC8Zmi+x5HZ1A7/88kuld999/2EbW1vPfPvdt85SripxHEcV1rkqkA9dn89vVlZWXHX77bcuD4fDMhqNfmlK4xdpZzmod8xyoX8585ejlq1bfbqTtoY4jiojKYbZmcwBjuPsrZSG6zpAtqBxd+B1DMM0y8tK5v3zn4+cM2nSpD4fTvIFlZYq0m5K25VSlFewLr30R1PfWPrOvHQ6E8wfS6WZoZXKi3x54HYLXtP0mAMHDnjxwQfmXkhE4osymxVpz6ftEfApFovpe++9t/zjj1fcHY8ngq7r2I7juq6rXM4e3clERDlLQ1furrXWyuPxmOXlZU/e8ec/nkREdiQSAVDkmkXaxQDOu3eff/6lbziuW4msZ8lDlHUr57gtdW8OzXqh/H6/rKismL3g4YdOrqio6OjtiNUiFWmnixA5zVwQEbKHSIpeLEecr0ovPR6P4fN6Vw4dOuSqOXPueIjqHsjn2BXBW6TPB8ANDQ2KiOjII8e9tHrN2k4iKgVgd7VrMmtBREJKKaVhwOsx11VUVvxl6rdPuq2mpqYDCEsgpr8s55gVaTcRIYiIw+GwuOSSSzYM6F/5fZ/f7xiG6SkorW94vR7D7/eLQMC/oaJfv8f2GTb0uzMuvnDsvLn319bU1HRkHRWxvtS6LVKR+obL7X0gL7dedNFFX+1MpMPtrW2VgVAQXtNsM7zmysryig+POmr8krPPPntDF+uF3hnALZrRirQTqE8p2SLLcXmnu3eBz8eVXKT/QSUuS9njBbqWswe2KMuvY7EYUMRUkXY/APdezp6oCNoi7WZKXJGKVATwzqdcYGpRcSsCeA8jcgKCGSa0dnnrgqVFKgJ4N2a7DAqO+22cvP3Wo9IwyL/PWkCiuzL2RSrSbglgALAWh0e7SyZfyO9GKgo/L1KRilSkIn0OnFhsT25akf736P8DUej4pJBf0jcAAAAASUVORK5CYII=";

// ── XLSX CDN ────────────────────────────────────────
function loadXLSX() {
  if (window._XLSX_FULL) return Promise.resolve(window._XLSX_FULL);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { window._XLSX_FULL = window.XLSX; res(window.XLSX); };
    s.onerror = () => rej(new Error('SheetJS CDN yüklenemedi'));
    document.head.appendChild(s);
  });
}

// ── Fatura PDF (popup + print) ──────────────────────
function faturaPdfAc(f, tlKur) {
  const kalemRows = (f.kalemler || []).map((k, i) => {
    const birim = k.adet > 0 ? (k.toplam || 0) / k.adet : (k.birimFiyat || 0);
    return `<tr style="border-bottom:1px solid #e5e5ea">
      <td style="padding:8px;text-align:center;color:#888">${i + 1}</td>
      <td style="padding:8px">
        <div style="font-weight:600">${k.urunAd || k.urunKod || '—'}</div>
        ${k.urunKod && k.urunAd ? `<div style="font-size:9px;color:#888">${k.urunKod}</div>` : ''}
        ${k.not ? `<div style="font-size:9px;color:#3B82F6;font-style:italic;margin-top:2px">${k.not}</div>` : ''}
      </td>
      <td style="padding:8px;text-align:center;font-weight:500">${k.adet}</td>
      <td style="padding:8px;text-align:right;font-variant-numeric:tabular-nums">$${fmt(birim)}</td>
      <td style="padding:8px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">$${fmt(k.toplam || 0)}</td>
    </tr>`;
  }).join('');

  const bugun = new Date().toLocaleDateString('tr-TR');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fatura ${f.no || ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:11px;color:#222;background:#fff;padding:28px 32px}
table{width:100%;border-collapse:collapse;table-layout:auto}
thead th{font-size:9px;font-weight:600;color:#444;text-transform:uppercase;letter-spacing:.5px;border-bottom:2.5px solid #222;padding:9px 8px}
@media print{body{padding:16px 18px}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:3px solid #d4a017;margin-bottom:18px">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="${BEKILLI_LOGO_PDF}" style="height:44px" alt="Bekilli Group" />
    <div style="font-size:10px;color:#444;font-weight:600">Bekilli Group İnşaat Otomotiv San ve Tic Ltd Şti</div>
  </div>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
  <div>
    <div style="font-size:22px;font-weight:600;letter-spacing:-.5px">FATURA</div>
    <div style="font-size:11px;color:#666;margin-top:2px">${f.no || '—'}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#666">Tarih: ${fmtD(f.tarih)}</div>
    <div style="font-size:11px;color:#666">${(f.kalemler || []).length} kalem</div>
  </div>
</div>
${kalemRows ? `<table>
  <thead><tr>
    <th style="width:36px;text-align:center">#</th>
    <th style="text-align:left">ÜRÜN</th>
    <th style="width:60px;text-align:center">MİKTAR</th>
    <th style="width:100px;text-align:right">BİRİM FİYAT</th>
    <th style="width:100px;text-align:right">TUTAR</th>
  </tr></thead>
  <tbody>${kalemRows}</tbody>
</table>` : ''}
<div style="margin-top:20px;border-top:2.5px solid #222;padding-top:14px;display:flex;justify-content:flex-end;gap:32px">
  ${f.odenen ? `<div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">Ödenen</div><div style="font-size:14px;font-weight:600;margin-top:2px;color:#15803D">$${fmt(f.odenen)}</div></div>
  <div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">Kalan</div><div style="font-size:14px;font-weight:600;margin-top:2px;color:#DC2626">$${fmt(f.kalan || 0)}</div></div>` : ''}
  <div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">TOPLAM</div><div style="font-size:18px;font-weight:600;margin-top:2px">$${fmt(f.tutar)}</div></div>
</div>
${tlKur > 0 ? `<div style="font-size:10px;margin-top:6px;text-align:right;color:#888">≈₺${fmt(f.tutar * tlKur, 0)} <span style="font-size:8px">($1 = ₺${fmt(tlKur, 2)})</span></div>` : ''}
${f.orijinalDoviz && f.orijinalDoviz !== 'USD' ? `<div style="font-size:10px;color:#b45309;margin-top:8px;background:#fef3c7;display:inline-block;padding:3px 10px;border-radius:5px">Orijinal: ${fmt(f.orijinalTutar)} ${f.orijinalDoviz}</div>` : ''}
${f.kdvOrani > 0 ? `<div style="font-size:10px;color:#7c3aed;margin-top:4px">KDV %${f.kdvOrani}: $${fmt(f.kdvTutar)}</div>` : ''}
<div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:10px;border-top:1.5px solid #e0e0e5;font-size:9px;color:#aaa">
  <span>${bugun} tarihinde hazırlanmıştır.</span>
  <span>Bekilli Group</span>
</div>
<script>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=700,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Fatura Excel ────────────────────────────────────
async function faturaExcelIndir(f) {
  const XLSX = await loadXLSX();
  const rows = [['Fatura No', 'Tarih', 'Toplam ($)', 'Ödenen ($)', 'Kalan ($)'],
    [f.no || '', fmtD(f.tarih), f.tutar || 0, f.odenen || 0, f.kalan || 0]];
  if (f.kalemler && f.kalemler.length > 0) {
    const hasNot = f.kalemler.some(k => k.not);
    rows.push([]);
    rows.push(hasNot ? ['Ürün', 'Adet', 'Birim Fiyat ($)', 'Toplam ($)', 'Not'] : ['Ürün', 'Adet', 'Birim Fiyat ($)', 'Toplam ($)']);
    f.kalemler.forEach(k => {
      const row = [k.urunAd || k.urunKod, k.adet, k.birimFiyat || 0, k.toplam || 0];
      if (hasNot) row.push(k.not || '');
      rows.push(row);
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fatura');
  XLSX.writeFile(wb, `Fatura_${f.no || 'export'}.xlsx`);
}

// ── Ekstre PDF (dönem) ──────────────────────────────
function ekstrePdfAc(faturalar, baslangic, bitis, bakiye, tlKur) {
  const filtered = filterByDate(faturalar, baslangic, bitis);
  const rows = filtered.map(f =>
    `<tr style="border-bottom:1px solid #e5e5ea"><td style="padding:6px 8px;font-weight:600">${f.no||'—'}</td><td style="padding:6px 8px">${fmtD(f.tarih)}</td><td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">$${fmt(f.tutar)}</td><td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">$${fmt(f.odenen||0)}</td><td style="padding:6px 8px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:${(f.kalan||0) > 0 ? '#DC2626' : '#222'}">$${fmt(f.kalan||0)}</td></tr>`
  ).join('');
  const donem = baslangic || bitis ? `${baslangic || '...'} — ${bitis || '...'}` : 'Tüm dönem';
  const bugun = new Date().toLocaleDateString('tr-TR');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ekstre</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:11px;color:#222;background:#fff;padding:28px 32px}
table{width:100%;border-collapse:collapse;table-layout:auto}
thead th{font-size:9px;font-weight:600;color:#444;text-transform:uppercase;letter-spacing:.5px;border-bottom:2.5px solid #222;padding:9px 8px}
@media print{body{padding:16px 18px}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:3px solid #d4a017;margin-bottom:18px">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="${BEKILLI_LOGO_PDF}" style="height:44px" alt="Bekilli Group" />
    <div style="font-size:10px;color:#444;font-weight:600">Bekilli Group İnşaat Otomotiv San ve Tic Ltd Şti</div>
  </div>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
  <div>
    <div style="font-size:22px;font-weight:600;letter-spacing:-.5px">HESAP EKSTRESİ</div>
    <div style="font-size:11px;color:#666;margin-top:2px">Dönem: ${donem}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;color:#666">${filtered.length} fatura</div>
  </div>
</div>
<div style="display:flex;gap:32px;margin-bottom:18px;padding:12px 16px;background:#f7f8fa;border-radius:8px">
  <div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">Toplam Borç</div><div style="font-size:14px;font-weight:600;margin-top:2px">$${fmt(bakiye?.toplamBorc||0)}</div></div>
  <div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">Toplam Alacak</div><div style="font-size:14px;font-weight:600;margin-top:2px;color:#15803D">$${fmt(bakiye?.toplamAlacak||0)}</div></div>
  <div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">Net Bakiye</div><div style="font-size:18px;font-weight:600;margin-top:2px;color:${(bakiye?.net||0) > 0 ? '#DC2626' : '#15803D'}">$${fmt(Math.abs(bakiye?.net||0))} ${(bakiye?.net||0) > 0 ? '(Borçlu)' : (bakiye?.net||0) < 0 ? '(Alacaklı)' : ''}</div></div>
  ${tlKur > 0 ? `<div><div style="font-size:8.5px;color:#888;text-transform:uppercase;letter-spacing:.5px">TL Karşılığı</div><div style="font-size:14px;font-weight:600;margin-top:2px;color:#888">≈₺${fmt(Math.abs(bakiye?.net||0)*tlKur,0)}</div></div>` : ''}
</div>
<table>
  <thead><tr>
    <th style="text-align:left">Fatura No</th>
    <th style="text-align:left">Tarih</th>
    <th style="text-align:right">Tutar</th>
    <th style="text-align:right">Ödenen</th>
    <th style="text-align:right">Kalan</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:10px;border-top:1.5px solid #e0e0e5;font-size:9px;color:#aaa">
  <span>${bugun} tarihinde hazırlanmıştır.</span>
  <span>Bekilli Group</span>
</div>
<script>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  const w = window.open('', '_blank', 'width=700,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

// ── Ekstre Excel (dönem) ────────────────────────────
async function ekstreExcelIndir(faturalar, baslangic, bitis, bakiye) {
  const XLSX = await loadXLSX();
  const filtered = filterByDate(faturalar, baslangic, bitis);
  const rows = [['Fatura No', 'Tarih', 'Tutar ($)', 'Ödenen ($)', 'Kalan ($)']];
  filtered.forEach(f => rows.push([f.no || '', fmtD(f.tarih), f.tutar || 0, f.odenen || 0, f.kalan || 0]));
  rows.push([]);
  rows.push(['', '', 'Toplam Borç', 'Toplam Alacak', 'Net Bakiye']);
  rows.push(['', '', bakiye?.toplamBorc || 0, bakiye?.toplamAlacak || 0, bakiye?.net || 0]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ekstre');
  XLSX.writeFile(wb, `Ekstre_${baslangic || 'tum'}_${bitis || 'donem'}.xlsx`);
}

// ── Tarih filtresi ──────────────────────────────────
function filterByDate(faturalar, baslangic, bitis) {
  if (!baslangic && !bitis) return faturalar;
  return faturalar.filter(f => {
    if (!f.tarih) return true;
    const t = f.tarih.slice(0, 10);
    if (baslangic && t < baslangic) return false;
    if (bitis && t > bitis) return false;
    return true;
  });
}

// ── Hero renk & badge hesabı ────────────────────────
function heroStyle(bakiye) {
  const borc = bakiye?.toplamBorc || 0;
  const alacak = bakiye?.toplamAlacak || 0;
  const pct = borc > 0 ? Math.round((alacak / borc) * 100) : 100;
  if (pct >= 85) return { cls: 'sip-hero-green', badge: 'İyi durumda', pct };
  if (pct >= 50) return { cls: 'sip-hero-purple', badge: 'Düzenli', pct };
  if (pct >= 25) return { cls: 'sip-hero-amber', badge: 'Takipte', pct };
  return { cls: 'sip-hero-red', badge: 'Ödeme bekleniyor', pct };
}

// ── Timeline builder (sadece mali milestone) ────────
function buildTimeline(hesap) {
  const items = [];
  (hesap.acikFaturalar || []).forEach(f => items.push({ tarih: f.tarih, tip: 'fatura', msg: `Fatura ${f.no || ''}`, sub: `$${fmt(f.tutar)} · ${(f.kalemler || []).length} kalem · açık`, dotCls: 'sip-tl-fill', msgCls: '' }));
  (hesap.kapananFaturalar || []).forEach(f => items.push({ tarih: f.tarih, tip: 'fatura', msg: `Fatura ${f.no || ''}`, sub: `$${fmt(f.tutar)} · kapandı`, dotCls: 'sip-tl-fill', msgCls: '' }));
  (hesap.bekleyenIadeler || []).forEach(f => items.push({ tarih: f.tarih, tip: 'iade', msg: `İade ${f.no || ''}`, sub: `$${fmt(f.tutar)} · ${f.aciklama || 'beklemede'}`, dotCls: 'sip-tl-amber', msgCls: 'sip-tl-msg-amber' }));
  (hesap.sonOdemeler || []).forEach(o => {
    const isTah = o.tip !== 'mahsup' && o.tip !== 'iade_kredisi';
    const eslCnt = (o.eslesmeler || []).length;
    items.push({ tarih: o.tarih, tip: 'odeme', msg: `${isTah ? 'Tahsilat' : 'İade kredisi'} — ${o.yontem || ''}`, sub: `$${fmt(o.tutar)}${eslCnt > 0 ? ` · ${eslCnt} fatura kapattı` : ''}`, dotCls: isTah ? 'sip-tl-green' : 'sip-tl-blue', msgCls: isTah ? 'sip-tl-msg-green' : 'sip-tl-msg-blue' });
  });
  // Bildirimler: sadece mali milestone (fiyat güncelleme, fatura bildirimi vb.)
  (hesap.bildirimler || []).forEach(b => {
    // Sipariş operasyonel güncellemeleri hariç tut (onlar Takip sekmesinde)
    const msg = b.mesaj || '';
    const isSipOps = msg.includes('ipariş') && (msg.includes('eklemede') || msg.includes('azırlanıyor') || msg.includes('amamlandı'));
    if (!isSipOps) {
      items.push({ tarih: b.tarih, tip: 'bildirim', msg: msg || 'Bildirim', sub: '', dotCls: 'sip-tl-amber', msgCls: 'sip-tl-msg-amber' });
    }
  });
  items.sort((a, b) => (b.tarih || '') > (a.tarih || '') ? 1 : -1);
  return items;
}

// ══════════════════════════════════════════════════════
// HesabimPage v5.1 — Main Component
// Masaüstü/Yatay: 2-panel master-detail (tab yok)
// Dikey (≤1024px): 3-tab tek kolon
// ══════════════════════════════════════════════════════
export default function HesabimPage({ t, hesap, pin, onRefresh }) {
  // ── State ──
  const [mainTab, setMainTab] = useState('faturalar');
  const [faturaSubTab, setFaturaSubTab] = useState('acik');
  const [openFaturaId, setOpenFaturaId] = useState(null);
  const [openOdemeId, setOpenOdemeId] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  // Sağ panel: 'faturalar' (default) | 'tum-odemeler' | 'tum-islemler'
  const [rightView, setRightView] = useState('faturalar');
  const [ekstreBaslangic, setEkstreBaslangic] = useState('');
  const [ekstreBitis, setEkstreBitis] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Media query listeners ──
  useEffect(() => {
    const mqL = window.matchMedia('(max-height: 500px) and (orientation: landscape)');
    const mqD = window.matchMedia('(min-width: 1025px)');
    const hL = (e) => { setIsLandscape(e.matches); if (!e.matches) setRightView('faturalar'); };
    const hD = (e) => { setIsDesktop(e.matches); };
    hL(mqL); hD(mqD);
    mqL.addEventListener('change', hL);
    mqD.addEventListener('change', hD);
    return () => { mqL.removeEventListener('change', hL); mqD.removeEventListener('change', hD); };
  }, []);

  // ── Bildirim okundu ──
  const bildirimOkundu = useCallback(async (ids) => {
    if (!pin || !ids?.length) return;
    try {
      await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Siparis-PIN': pin }, body: JSON.stringify({ islem: 'bildirim_okundu', bildirimIds: ids }) });
      if (onRefresh) onRefresh();
    } catch (e) { console.warn('Bildirim okundu hatası:', e.message); }
  }, [pin, onRefresh]);

  if (!hesap || !hesap.bakiye) {
    return (<div className="sip-2panel"><div className="sip-panel"><div className="sip-empty">{t.hesap_bos}</div></div><div className="sip-panel" /></div>);
  }

  const { bakiye, acikFaturalar = [], sonOdemeler = [], bildirimler = [], kapananFaturalar = [], bekleyenIadeler = [] } = hesap;
  const tlKur = hesap.kurlar?.USDTRY || hesap.kurlar?.usdTry || 0;
  const okunmamisSayisi = bildirimler.filter(b => !b.okundu).length;
  const hero = heroStyle(bakiye);
  const allFaturalar = [...acikFaturalar, ...kapananFaturalar, ...bekleyenIadeler];
  const timeline = useMemo(() => buildTimeline(hesap), [hesap]);
  const odemeOrani = hero.pct;
  const ortOdemeSuresi = useMemo(() => {
    const geciken = acikFaturalar.filter(f => f.gecikmeGun > 0);
    if (geciken.length === 0) return 0;
    return Math.round(geciken.reduce((s, f) => s + f.gecikmeGun, 0) / geciken.length);
  }, [acikFaturalar]);

  const toggleFatura = (id) => setOpenFaturaId(prev => prev === id ? null : id);
  const toggleOdeme = (id) => setOpenOdemeId(prev => prev === id ? null : id);

  const isWideLayout = isLandscape || isDesktop;
  const miniOdeCount = isLandscape ? 3 : 8;
  const miniIslCount = isLandscape ? 0 : 7;

  // ── Fatura listesi (sağ panel default) ──
  const faturaContent = (
    <>
      <div className="sip-export-bar">
        <button className="sip-export-btn" onClick={() => ekstrePdfAc(allFaturalar, ekstreBaslangic, ekstreBitis, bakiye, tlKur)}>Komple ekstre</button>
        <button className="sip-export-btn" onClick={() => ekstreExcelIndir(allFaturalar, ekstreBaslangic, ekstreBitis, bakiye)}>Excel</button>
        <button className="sip-export-btn" onClick={() => setShowDatePicker(!showDatePicker)}>Tarih seç</button>
      </div>
      {showDatePicker && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input type="date" value={ekstreBaslangic} onChange={e => setEkstreBaslangic(e.target.value)} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--sip-text-muted)' }}>—</span>
          <input type="date" value={ekstreBitis} onChange={e => setEkstreBitis(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}
      <div className="sip-fat-subtabs">
        <button className={`sip-fat-subtab ${faturaSubTab === 'acik' ? 'active' : ''}`} onClick={() => { setFaturaSubTab('acik'); setOpenFaturaId(null); }}>Açık ({acikFaturalar.length})</button>
        <button className={`sip-fat-subtab ${faturaSubTab === 'kapanan' ? 'active' : ''}`} onClick={() => { setFaturaSubTab('kapanan'); setOpenFaturaId(null); }}>Kapanan ({kapananFaturalar.length})</button>
        <button className={`sip-fat-subtab ${faturaSubTab === 'iade' ? 'active' : ''}`} onClick={() => { setFaturaSubTab('iade'); setOpenFaturaId(null); }}>{t.iade || 'İade'} ({bekleyenIadeler.length})</button>
      </div>
      {faturaSubTab === 'acik' && acikFaturalar.map(f => <FaturaCard key={f.no || f.faturaId} f={f} t={t} tlKur={tlKur} isOpen={openFaturaId === (f.faturaId || f.no)} onToggle={() => toggleFatura(f.faturaId || f.no)} tip="acik" />)}
      {faturaSubTab === 'acik' && acikFaturalar.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>{t.acik_fatura_yok || 'Açık fatura bulunmuyor'}</div>}
      {faturaSubTab === 'kapanan' && kapananFaturalar.map(f => <FaturaCard key={f.no} f={f} t={t} tlKur={tlKur} isOpen={openFaturaId === f.no} onToggle={() => toggleFatura(f.no)} tip="kapanan" />)}
      {faturaSubTab === 'kapanan' && kapananFaturalar.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>Kapanan fatura bulunmuyor</div>}
      {faturaSubTab === 'iade' && bekleyenIadeler.map(f => <FaturaCard key={f.no} f={f} t={t} tlKur={tlKur} isOpen={openFaturaId === f.no} onToggle={() => toggleFatura(f.no)} tip="iade" />)}
      {faturaSubTab === 'iade' && bekleyenIadeler.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>{t.iade_yok || 'İade bulunmuyor'}</div>}
    </>
  );

  // ── Tüm ödemeler listesi (sağ panel, "Tümü" tıklanınca) ──
  const tumOdemelerContent = (
    <>
      <div className="sip-section-title">
        <span>{t.hesap_hareketleri || 'Hesap hareketleri'}</span>
        <span style={{ fontSize: 11, color: 'var(--sip-accent)', cursor: 'pointer' }} onClick={() => setRightView('faturalar')}>← Faturalar</span>
      </div>
      <div className="sip-legend"><span><span className="sip-legend-dot" style={{ background: '#1D9E75' }} />Tahsilat</span><span><span className="sip-legend-dot" style={{ background: '#378ADD' }} />İade kredisi</span></div>
      {sonOdemeler.map((o, i) => {
        const isTah = o.tip !== 'mahsup' && o.tip !== 'iade_kredisi';
        return (
          <div key={i}>
            <div className={`sip-pay-item${isTah ? '' : ' sip-pay-iade'}`} onClick={() => toggleOdeme(`w${i}`)}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDLong(o.tarih)}</div>
                <div style={{ fontSize: 11, color: 'var(--sip-text-muted)' }}>{o.yontem || '—'}{o.aciklama ? ` · ${o.aciklama}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: isTah ? '#1D9E75' : '#378ADD' }}>${fmt(o.tutar)}</div>
                {tlKur > 0 && <div style={{ fontSize: 10, color: 'var(--sip-text-faint)' }}>≈₺{fmt(o.tutar * tlKur, 0)}</div>}
              </div>
            </div>
            {openOdemeId === `w${i}` && Array.isArray(o.eslesmeler) && o.eslesmeler.length > 0 && (
              <div className={`sip-pay-detail ${isTah ? 'sip-pay-tah' : 'sip-pay-iade-d'}`}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Kapattığı faturalar:</div>
                {o.eslesmeler.map((e, ei) => (<div key={ei} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{e.faturaNo}</span><span style={{ fontWeight: 500 }}>${fmt(e.kapatilan)}</span></div>))}
              </div>
            )}
          </div>
        );
      })}
      {sonOdemeler.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>{t.odeme_yok || 'Ödeme kaydı bulunmuyor'}</div>}
    </>
  );

  // ── Tüm işlemler listesi (sağ panel, "Tümü" tıklanınca) ──
  const tumIslemlerContent = (
    <>
      <div className="sip-section-title">
        <span>{t.son_islemler || 'Son işlemler'}</span>
        <span style={{ fontSize: 11, color: 'var(--sip-accent)', cursor: 'pointer' }} onClick={() => setRightView('faturalar')}>← Faturalar</span>
      </div>
      {okunmamisSayisi > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--sip-danger)' }}>{okunmamisSayisi} okunmamış</span>
          <button className="sip-export-btn" style={{ flex: 'none', padding: '4px 12px' }} onClick={() => { bildirimOkundu(bildirimler.filter(b => !b.okundu).map(b => b.id)); }}>Okundu işaretle</button>
        </div>
      )}
      <div className="sip-timeline">
        {timeline.map((item, i) => (<div key={i} className="sip-tl-item"><div className={`sip-tl-dot ${item.dotCls}`} />{i < timeline.length - 1 && <div className="sip-tl-line" />}<div className="sip-tl-date">{fmtDLong(item.tarih)}</div><div className={`sip-tl-msg ${item.msgCls}`}>{item.msg}</div>{item.sub && <div className="sip-tl-sub">{item.sub}</div>}</div>))}
        {timeline.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>Henüz kayıt bulunmuyor</div>}
      </div>
    </>
  );

  // ══ WIDE LAYOUT (Masaüstü + Yatay telefon) ══
  if (isWideLayout) {
    return (
      <div className="sip-2panel">
        {/* ── Sol panel: bakiye + hesap hareketleri + son işlemler ── */}
        <div className="sip-panel" style={{ overflow: isLandscape ? 'hidden' : undefined, display: 'flex', flexDirection: 'column' }}>
          <div className={`sip-bakiye-hero ${hero.cls}`} style={isLandscape ? { padding: '10px 12px', marginBottom: 6 } : undefined}>
            {isLandscape ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="sip-bakiye-net" style={{ fontSize: 18 }}>${fmt(Math.abs(bakiye.net))}</span>
                  <span style={{ fontSize: 9, opacity: 0.8 }}>%{hero.pct}</span>
                </div>
                <div style={{ fontSize: 9, opacity: 0.7 }}>{t.bakiye} · {hero.badge}</div>
              </>
            ) : (
              <>
                <div className="sip-bakiye-label">{t.bakiye}</div>
                <div className="sip-bakiye-head">
                  <span className="sip-bakiye-net">${fmt(Math.abs(bakiye.net))}</span>
                  {(bakiye.net > 0.01 || bakiye.net < -0.01) && <span className="sip-bakiye-badge">{bakiye.net > 0.01 ? t.borc_durumu : t.alacak_durumu}</span>}
                </div>
                <div className="sip-bakiye-doviz">
                  {tlKur > 0 ? <>≈ ₺{fmt(Math.abs(bakiye.net) * tlKur, 0)} <span className="sip-bakiye-kur">($1 = ₺{fmt(tlKur, 2)})</span></> : ''}
                </div>
                <div className="sip-bakiye-row">
                  <span>{t.toplam_borc}: ${fmt(bakiye.toplamBorc)}</span>
                  <span>{t.toplam_alacak}: ${fmt(bakiye.toplamAlacak)}</span>
                </div>
                {bakiye.toplamBorc > 0 && (<><div className="sip-bakiye-bar"><div className="sip-bakiye-bar-fill" style={{ width: `${Math.min(100, hero.pct)}%` }} /></div><div className="sip-bakiye-pct">%{hero.pct} ödendi</div></>)}
                <div className="sip-hero-status">{hero.badge}</div>
              </>
            )}
          </div>

          {/* Hesap hareketleri (son ödemeler) */}
          <div className="sip-section-title" style={{ marginBottom: 4 }}>
            <span>{t.hesap_hareketleri || 'Hesap hareketleri'}</span>
            <span style={{ fontSize: 10, color: 'var(--sip-accent)', cursor: 'pointer' }} onClick={() => setRightView('tum-odemeler')}>Tümü →</span>
          </div>
          {sonOdemeler.slice(0, miniOdeCount).map((o, i) => {
            const isTah = o.tip !== 'mahsup' && o.tip !== 'iade_kredisi';
            return (
              <div key={i} className="sip-mini-item" onClick={() => setRightView('tum-odemeler')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="sip-legend-dot" style={{ width: 6, height: 6, background: isTah ? '#1D9E75' : '#378ADD' }} />
                  <span style={{ fontSize: 11, fontWeight: 500 }}>${fmt(o.tutar)}</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--sip-text-muted)' }}>{fmtD(o.tarih)}</span>
              </div>
            );
          })}

          {/* Son işlemler (sadece desktop, landscape'te log bar) */}
          {isLandscape ? (
            <div className="sip-land-tlbar" onClick={() => setRightView('tum-islemler')}>
              <span className="sip-land-tlbar-dot" /> {t.son_islemler || 'Son işlemler'}
              {okunmamisSayisi > 0 && <span className="sip-notif-dot" style={{ position: 'relative', top: -2 }} />}
            </div>
          ) : (
            <>
              <div className="sip-section-title" style={{ marginTop: 8, marginBottom: 4 }}>
                <span>{t.son_islemler || 'Son işlemler'}</span>
                <span style={{ fontSize: 10, color: 'var(--sip-accent)', cursor: 'pointer' }} onClick={() => setRightView('tum-islemler')}>
                  Tümü →{okunmamisSayisi > 0 && <span className="sip-notif-dot" style={{ position: 'relative', top: -2, marginLeft: 4 }} />}
                </span>
              </div>
              {timeline.slice(0, miniIslCount).map((item, i) => (
                <div key={i} className="sip-mini-item" onClick={() => setRightView('tum-islemler')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="sip-legend-dot" style={{ width: 6, height: 6, background: item.dotCls.includes('green') ? '#1D9E75' : item.dotCls.includes('blue') ? '#378ADD' : item.dotCls.includes('amber') ? '#EF9F27' : '#534AB7' }} />
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{item.msg}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--sip-text-muted)' }}>{fmtD(item.tarih)}</span>
                </div>
              ))}
            </>
          )}

          {isLandscape && <div style={{ fontSize: 9, color: 'var(--sip-text-faint)', textAlign: 'center', marginTop: 'auto', padding: 2 }}>scroll kilitli</div>}
        </div>

        {/* ── Sağ panel: faturalar (default) / tüm ödemeler / tüm işlemler ── */}
        <div className="sip-panel">
          {rightView === 'faturalar' && faturaContent}
          {rightView === 'tum-odemeler' && tumOdemelerContent}
          {rightView === 'tum-islemler' && tumIslemlerContent}
        </div>
      </div>
    );
  }

  // ══ PORTRAIT LAYOUT (≤1024px, dikey) — 3-tab ══
  return (
    <>
      <div className="sip-hesabim-subtab">
        <button className={mainTab === 'faturalar' ? 'active' : ''} onClick={() => setMainTab('faturalar')}>{t.faturalar || 'Faturalar'}</button>
        <button className={mainTab === 'odemeler' ? 'active' : ''} onClick={() => setMainTab('odemeler')}>{t.odeme_tahsilat || 'Ödeme & Tahsilat'}</button>
        <button className={mainTab === 'log' ? 'active' : ''} onClick={() => setMainTab('log')} style={{ position: 'relative' }}>Log{okunmamisSayisi > 0 && <span className="sip-notif-dot" style={{ position: 'absolute', top: 6, right: 8 }} />}</button>
      </div>

      <div className="sip-2panel">
        <div className="sip-panel">
          {/* ── Bakiye Hero (dinamik renk) ── */}
          <div className={`sip-bakiye-hero ${hero.cls}`}>
            <div className="sip-bakiye-label">{t.bakiye}</div>
            <div className="sip-bakiye-head">
              <span className="sip-bakiye-net">${fmt(Math.abs(bakiye.net))}</span>
              {(bakiye.net > 0.01 || bakiye.net < -0.01) && <span className="sip-bakiye-badge">{bakiye.net > 0.01 ? t.borc_durumu : t.alacak_durumu}</span>}
            </div>
            <div className="sip-bakiye-doviz">
              {tlKur > 0 ? <>≈ ₺{fmt(Math.abs(bakiye.net) * tlKur, 0)} <span className="sip-bakiye-kur">($1 = ₺{fmt(tlKur, 2)})</span></> : (bakiye.net > 0.01 ? t.borc_durumu : bakiye.net < -0.01 ? t.alacak_durumu : '')}
            </div>
            <div className="sip-bakiye-row">
              <span>{t.toplam_borc}: ${fmt(bakiye.toplamBorc)}</span>
              <span>{t.toplam_alacak}: ${fmt(bakiye.toplamAlacak)}</span>
            </div>
            {bakiye.toplamBorc > 0 && (<><div className="sip-bakiye-bar"><div className="sip-bakiye-bar-fill" style={{ width: `${Math.min(100, hero.pct)}%` }} /></div><div className="sip-bakiye-pct">%{hero.pct} ödendi</div></>)}
            <div className="sip-hero-status">{hero.badge}</div>
          </div>

          {/* ── FATURALAR TAB ── */}
          {mainTab === 'faturalar' && faturaContent}

          {/* ── ÖDEME & TAHSİLAT TAB ── */}
          {mainTab === 'odemeler' && (
            <>
              <div className="sip-perf-row">
                <div className="sip-perf-card"><div className="sip-perf-num" style={{ color: '#1D9E75' }}>%{odemeOrani}</div><div className="sip-perf-label">Ödeme oranı</div></div>
                <div className="sip-perf-card"><div className="sip-perf-num">{ortOdemeSuresi}g</div><div className="sip-perf-label">Ort. gecikme</div></div>
                <div className="sip-perf-card"><div className="sip-perf-num" style={{ color: bakiye.net > 0 ? '#E24B4A' : '#1D9E75' }}>${fmt(Math.abs(bakiye.net), 0)}</div><div className="sip-perf-label">Kalan borç</div></div>
              </div>
              <div className="sip-right-card" style={{ marginBottom: 10 }}><div className="sip-section-title" style={{ marginBottom: 6 }}>Harcama trendi</div><TrendChart data={hesap.trendData} tlKur={tlKur} /></div>
              <div className="sip-legend"><span><span className="sip-legend-dot" style={{ background: '#1D9E75' }} />Tahsilat</span><span><span className="sip-legend-dot" style={{ background: '#378ADD' }} />İade kredisi</span></div>
              {sonOdemeler.map((o, i) => {
                const isTah = o.tip !== 'mahsup' && o.tip !== 'iade_kredisi';
                return (
                  <div key={i}>
                    <div className={`sip-pay-item${isTah ? '' : ' sip-pay-iade'}`} onClick={() => toggleOdeme(i)}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDLong(o.tarih)}</div>
                        <div style={{ fontSize: 11, color: 'var(--sip-text-muted)' }}>{o.yontem || '—'}{o.aciklama ? ` · ${o.aciklama}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: isTah ? '#1D9E75' : '#378ADD' }}>${fmt(o.tutar)}</div>
                        {tlKur > 0 && <div style={{ fontSize: 10, color: 'var(--sip-text-faint)' }}>≈₺{fmt(o.tutar * tlKur, 0)}</div>}
                      </div>
                    </div>
                    {openOdemeId === i && Array.isArray(o.eslesmeler) && o.eslesmeler.length > 0 && (
                      <div className={`sip-pay-detail ${isTah ? 'sip-pay-tah' : 'sip-pay-iade-d'}`}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Kapattığı faturalar:</div>
                        {o.eslesmeler.map((e, ei) => (<div key={ei} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>{e.faturaNo}</span><span style={{ fontWeight: 500 }}>${fmt(e.kapatilan)}</span></div>))}
                      </div>
                    )}
                  </div>
                );
              })}
              {sonOdemeler.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>{t.odeme_yok || 'Ödeme kaydı bulunmuyor'}</div>}
            </>
          )}

          {/* ── LOG TAB ── */}
          {mainTab === 'log' && (
            <>
              {okunmamisSayisi > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--sip-danger)' }}>{okunmamisSayisi} okunmamış bildirim</span>
                  <button className="sip-export-btn" style={{ flex: 'none', padding: '4px 12px' }} onClick={() => { bildirimOkundu(bildirimler.filter(b => !b.okundu).map(b => b.id)); }}>Okundu işaretle</button>
                </div>
              )}
              <div className="sip-timeline">
                {timeline.map((item, i) => (<div key={i} className="sip-tl-item"><div className={`sip-tl-dot ${item.dotCls}`} />{i < timeline.length - 1 && <div className="sip-tl-line" />}<div className="sip-tl-date">{fmtDLong(item.tarih)}</div><div className={`sip-tl-msg ${item.msgCls}`}>{item.msg}</div>{item.sub && <div className="sip-tl-sub">{item.sub}</div>}</div>))}
                {timeline.length === 0 && <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '12px 0' }}>Henüz kayıt bulunmuyor</div>}
              </div>
            </>
          )}
        </div>

        {/* Sağ panel gizli (portrait'te CSS ile gizleniyor) */}
        <div className="sip-panel" />
      </div>
    </>
  );
}

// ── Fatura Card (TEP: acik + kapanan + iade — tek component) ──
function FaturaCard({ f, t, tlKur, isOpen, onToggle, tip }) {
  const isIade = tip === 'iade';
  const isKapali = tip === 'kapanan';
  const isAcik = tip === 'acik';

  // Renk kodlu kenar
  const borderKlass = isIade ? 'iade' : isKapali ? 'sip-fatura-kapali'
    : (f.gecikmeGun >= 30 ? 'sip-fatura-gecikme-kritik' : f.gecikmeGun >= 7 ? 'sip-fatura-gecikme-uyari' : 'sip-fatura-yeni');

  // Gecikme badge
  const gecikmeKlass = isAcik && f.gecikmeGun >= 30 ? 'sip-gecikme-kritik'
    : isAcik && f.gecikmeGun >= 7 ? 'sip-gecikme-uyari'
    : isAcik && f.gecikmeGun > 0 ? 'sip-gecikme-yeni' : '';

  // Progress bar (sadece açık)
  const progress = isAcik && f.tutar > 0 ? Math.min(100, ((f.odenen || 0) / f.tutar) * 100) : 0;

  // Kalan tutar rengi = gecikme rengiyle uyumlu
  const kalanRenk = isAcik ? (f.gecikmeGun >= 30 ? 'var(--sip-danger)' : f.gecikmeGun >= 7 ? 'var(--sip-orange)' : 'var(--sip-accent)') : null;

  return (
    <div>
      <div className={`sip-fatura ${borderKlass}`} onClick={onToggle}>
        <div className="sip-fatura-header">
          <span className="sip-fatura-no">
            {isIade && <span className="sip-badge sip-badge-hazir" style={{ marginRight: 6, fontSize: 9 }}>{t.iade_kisa}</span>}
            {f.no || '—'}
            {isAcik && f.gecikmeGun > 0 && <span className={`sip-gecikme ${gecikmeKlass}`}>{f.gecikmeGun} {t.gun}</span>}
            {isKapali && <span className="sip-fatura-check">✓</span>}
          </span>
          {isIade
            ? <span className="sip-iade-tutar">-${fmt(f.tutar)}</span>
            : isKapali
              ? <span className="sip-fatura-tutar-kapali">${fmt(f.tutar)}</span>
              : <span className="sip-fatura-kalan" style={kalanRenk ? { color: kalanRenk } : undefined}>${fmt(f.kalan)}</span>
          }
        </div>
        <div className="sip-fatura-meta">
          <span>{fmtD(f.tarih)}</span>
          {isAcik && <span>{t.toplam}: ${fmt(f.tutar)}</span>}
          {isAcik && <span>{t.odenen}: ${fmt(f.odenen || 0)}</span>}
          {isIade && f.aciklama && <span>{f.aciklama}</span>}
          {isKapali && <span>{t.toplam}: ${fmt(f.tutar)}</span>}
        </div>
        {isAcik && <div className="sip-fatura-bar"><div className="sip-fatura-bar-fill" style={{ width: `${progress}%` }} /></div>}
      </div>
      {isOpen && (
        <div className="sip-kalem-detay">
          {/* Özet bilgiler — her zaman göster */}
          {(isKapali || isIade) && (
            <div className="sip-kalem-detay-row"><span>{t.toplam}</span><span>${fmt(f.tutar)}</span></div>
          )}
          {f.orijinalDoviz && f.orijinalDoviz !== 'USD' && (
            <div className="sip-kalem-detay-row"><span>{f.orijinalDoviz}</span><span>{fmt(f.orijinalTutar)}</span></div>
          )}
          {tlKur > 0 && (
            <div className="sip-kalem-detay-row"><span>TL karşılığı</span><span>≈₺{fmt((f.tutar || 0) * tlKur, 0)}</span></div>
          )}
          {f.kdvOrani > 0 && (
            <div className="sip-kalem-detay-row"><span>KDV %{f.kdvOrani}</span><span>${fmt(f.kdvTutar)}</span></div>
          )}
          {isAcik && f.odenen > 0 && (
            <div className="sip-kalem-detay-row">
              <span>{t.odenen}</span>
              <span className="sip-kalem-odenen">${fmt(f.odenen)}</span>
            </div>
          )}
          {/* Kalemler */}
          {Array.isArray(f.kalemler) && f.kalemler.length > 0 ? f.kalemler.map((k, ki) => (
            <div key={ki} className="sip-kalem-row">
              <div className="sip-kalem-main">
                <span className="sip-kalem-sira">{ki + 1}</span>
                <div className="sip-kalem-info">
                  <span className="sip-kalem-ad">{k.urunAd || k.urunKod || '—'}</span>
                  {k.urunKod && k.urunAd && <span className="sip-kalem-kod">{k.urunKod}</span>}
                </div>
                <span className="sip-kalem-adet">{k.adet}x</span>
                <span className="sip-kalem-tutar">{isIade ? '-' : ''}${fmt(k.toplam)}</span>
              </div>
              {k.not && <div className="sip-kalem-not-text">{k.not}</div>}
            </div>
          )) : (
            <div className="sip-kalem-detay-row" style={{ opacity: 0.5 }}>
              <span>Kalem detayı mevcut değil</span>
            </div>
          )}
          <div className="sip-fatura-actions">
            <button className="sip-fatura-action" onClick={e => { e.stopPropagation(); faturaPdfAc(f, tlKur); }}>PDF</button>
            <button className="sip-fatura-action" onClick={e => { e.stopPropagation(); faturaExcelIndir(f); }}>Excel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Trend Chart (6 ay bar) ───────────────────────────
function TrendChart({ data, tlKur }) {
  if (!data || data.length === 0) return <div style={{ fontSize: 12, color: 'var(--sip-text-faint)', padding: '8px 0' }}>Henüz yeterli veri yok</div>;
  const max = Math.max(...data.map(d => d.tutar || 0), 1);
  const lastIdx = data.length - 1;

  return (
    <div className="sip-trend">
      {data.map((d, i) => (
        <div key={i} className="sip-trend-col">
          <div className={`sip-trend-bar ${i === lastIdx ? 'current' : ''}`}
            style={{ height: `${Math.max(8, ((d.tutar || 0) / max) * 100)}%` }}
            title={`${d.ay}: $${fmt(d.tutar)}`} />
          <div className="sip-trend-label">{d.ay}</div>
          <div className="sip-trend-val">${fmt(d.tutar, 0)}</div>
          {tlKur > 0 && <div className="sip-trend-val" style={{ fontSize: 8, opacity: 0.5 }}>₺{fmt((d.tutar || 0) * tlKur, 0)}</div>}
        </div>
      ))}
    </div>
  );
}
