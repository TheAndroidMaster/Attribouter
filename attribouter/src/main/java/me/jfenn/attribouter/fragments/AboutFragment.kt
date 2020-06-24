package me.jfenn.attribouter.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import me.jfenn.attribouter.Attribouter
import me.jfenn.attribouter.R
import me.jfenn.attribouter.adapters.WedgeAdapter
import me.jfenn.attribouter.interfaces.Notifiable
import me.jfenn.attribouter.provider.LifecycleInstance
import me.jfenn.attribouter.provider.wedge.XMLWedgeProvider
import me.jfenn.attribouter.wedges.Wedge
import me.jfenn.gitrest.impl.gitea.GiteaProvider
import me.jfenn.gitrest.impl.github.GithubProvider
import me.jfenn.gitrest.impl.gitlab.GitlabProvider

class AboutFragment : Fragment(), Notifiable {

    private var recycler: RecyclerView? = null
    private var adapter: WedgeAdapter? = null

    private var wedges: List<Wedge<*>>? = null
    private var tokens = HashMap<String, String>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        recycler = inflater.inflate(R.layout.attribouter_fragment_about, container, false) as RecyclerView

        val args = arguments
        var fileRes = R.xml.attribouter
        if (args != null) {
            fileRes = args.getInt(Attribouter.EXTRA_FILE_RES, fileRes)

            // parse hostname args
            args.keySet().filter { it.startsWith(Attribouter.EXTRA_TOKEN) }.forEach { key ->
                val hostname = key.substring(Attribouter.EXTRA_TOKEN.length)
                val token = args.getString(key, "")
                if (token.isNotBlank())
                    tokens[hostname] = token
            }
        }

        val parser = resources.getXml(fileRes)
        val provider = XMLWedgeProvider(parser)
        val lifecycle = LifecycleInstance(
                services = listOf(
                        GithubProvider,
                        GitlabProvider,
                        GiteaProvider
                ).map {
                    it.apply {
                        tokens.putAll(this@AboutFragment.tokens)
                    }
                },
                scope = viewLifecycleOwner.lifecycleScope,
                notifiable = this
        )

        wedges = provider.map { _, wedge ->
            wedge.withWedgeProvider(provider).create(lifecycle)
        }.getAllWedges()

        parser.close()

        adapter = WedgeAdapter(wedges)
        recycler?.apply {
            layoutManager = LinearLayoutManager(context)
            //addItemDecoration(DividerItemDecoration(context, DividerItemDecoration.VERTICAL))
            adapter = this@AboutFragment.adapter
        }

        return recycler
    }

    override fun onItemChanged(changed: Wedge<*>) {
        wedges?.indexOf(changed)?.let {
            recycler?.post { adapter?.notifyItemChanged(it) }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        //providers?.forEach { it.destroy() }
    }
}
